"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, FileDown, Loader2, Lock, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  upsertCaseDocument,
  finalizeCaseDocument,
  resetCaseDocument,
} from "@/lib/actions/case-documents";
import { buildCaseDoc } from "@/lib/documents/buildCaseDoc";
import type { EditorDocJSON } from "@/lib/documents/blocks";
import type { CaseDocData, PatientDocData } from "@/lib/pdf/case-doc";
import type { PdfCompany } from "@/lib/pdf/theme";
import type { CaseDocEditorApi } from "./editor/CaseDocEditor";

// Tiptap stays out of the SSR bundle and off every other route.
const CaseDocEditor = dynamic(
  () => import("./editor/CaseDocEditor").then((m) => m.CaseDocEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading editor…
      </div>
    ),
  }
);

const TABS = ["Edit", "PDF Preview"] as const;
type Tab = (typeof TABS)[number];

export function DocumentEditorPage({
  patientId,
  patientName,
  caseId,
  initialDoc,
  sourceData,
  docVars,
  status,
  isAdmin,
}: {
  patientId: string;
  patientName: string;
  caseId: string;
  initialDoc: EditorDocJSON;
  /** `company` rides along so the client-side rebuild paths (reset, corrupt
   *  draft) can re-seed with the org's identity — buildCaseDoc runs in the
   *  browser here, so the branding must arrive as serialized data. */
  sourceData: { case: CaseDocData; patient: PatientDocData; company: PdfCompany };
  /** Org-branded --doc-* sheet overrides (orgToDocVars). */
  docVars?: Record<string, string>;
  status: "draft" | "finalized";
  isAdmin: boolean;
}) {
  const router = useRouter();
  const editorApi = React.useRef<CaseDocEditorApi | null>(null);

  const [tab, setTab] = React.useState<Tab>("Edit");
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [confirmFinalize, setConfirmFinalize] = React.useState(false);
  // Latest content across tab switches. The editor UNMOUNTS in preview mode, so
  // remounting from `initialDoc` (the last SAVED state) would silently discard
  // everything typed since.
  const [liveContent, setLiveContent] = React.useState<EditorDocJSON | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  const editable = status === "draft";

  const currentJson = React.useCallback((): EditorDocJSON => {
    const doc = (tab === "Edit" ? editorApi.current?.getJSON() : null) ?? liveContent ?? initialDoc;
    // Round-trip through JSON before this crosses a server-action boundary.
    // getJSON() hands back ProseMirror's own node objects; Next's server-action
    // serializer drops what it doesn't recognise, and the symptom is every
    // `attrs` arriving as {} — a document that saves with its structure intact
    // and all of its content gone.
    return JSON.parse(JSON.stringify(doc)) as EditorDocJSON;
  }, [tab, liveContent, initialDoc]);

  // Blob URLs are leaked unless explicitly revoked.
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  /**
   * Renders the preview on the SERVER: the PDF fonts are registered from the
   * filesystem (node:fs in lib/pdf/common.tsx), so react-pdf cannot run in the
   * browser at all. The upside is that the preview is the download, byte for
   * byte, rather than an approximation of it.
   */
  const renderPreview = React.useCallback(
    async (doc: EditorDocJSON) => {
      setPreviewError(null);
      setBusy("preview");
      try {
        const res = await fetch(`/api/pdf/draft/${caseId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc }),
        });
        if (!res.ok) {
          setPreviewError(await res.text());
          return;
        }
        const blob = await res.blob();
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : "Preview failed");
      } finally {
        setBusy(null);
      }
    },
    [caseId]
  );

  // The expensive render happens once per toggle, not per keystroke.
  function switchTab(next: Tab) {
    if (next === tab) return;
    if (next === "PDF Preview") {
      const doc = currentJson();
      setLiveContent(doc);
      void renderPreview(doc);
    }
    setTab(next);
  }

  async function persist(): Promise<EditorDocJSON | null> {
    const doc = currentJson();
    const r = await upsertCaseDocument(patientId, caseId, doc, sourceData);
    if (r.error) {
      toast.error(r.error);
      return null;
    }
    setLiveContent(doc);
    setDirty(false);
    return doc;
  }

  async function onSave() {
    setBusy("save");
    const doc = await persist();
    setBusy(null);
    if (doc) toast.success("Document saved.");
  }

  async function onDownload() {
    setBusy("download");
    const doc = await persist();
    if (!doc) return setBusy(null);
    try {
      const res = await fetch(`/api/pdf/draft/${caseId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc }),
      });
      if (!res.ok) {
        toast.error("Could not generate the PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${patientName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  async function onReset() {
    setConfirmReset(false);
    setBusy("reset");
    const rebuilt = buildCaseDoc(sourceData.case, sourceData.patient, sourceData.company);
    const r = await resetCaseDocument(patientId, caseId, rebuilt);
    setBusy(null);
    if (r.error) return toast.error(r.error);
    editorApi.current?.setContent(rebuilt);
    setLiveContent(rebuilt);
    setDirty(false);
    toast.success("Document reset to the generated template.");
  }

  async function onFinalize() {
    setConfirmFinalize(false);
    setBusy("finalize");
    // A failed save must stop the lock — finalizing anyway would freeze the
    // document without the latest edits.
    const saved = await persist();
    if (!saved) return setBusy(null);
    const r = await finalizeCaseDocument(patientId, caseId);
    setBusy(null);
    if (r.error) return toast.error(r.error);
    toast.success("Document finalized — it can no longer be edited.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/patients/${patientId}?case=${caseId}`}
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to {patientName}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              Document
              {status === "finalized" && (
                <Badge tone="green" className="gap-1">
                  <Lock className="size-3" /> Finalized
                </Badge>
              )}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {editable
                ? "Edit the document, then download it. The generated PDF is unaffected until you save."
                : "This document is finalized and read-only."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setConfirmReset(true)}
                  disabled={busy !== null}
                >
                  <RotateCcw /> Reset
                </Button>
                <Button onClick={onSave} disabled={busy !== null || !dirty} pending={busy === "save"}>
                  <Save /> Save
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={onDownload} pending={busy === "download"}>
              <FileDown /> Download
            </Button>
            {editable && isAdmin && (
              <Button
                variant="secondary"
                onClick={() => setConfirmFinalize(true)}
                disabled={busy !== null}
              >
                <Lock /> Finalize
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tab toggle rather than a split pane: the PDF render is server-side and
          costs a round trip, so it happens once per switch. */}
      <div className="flex items-center gap-1 rounded-lg bg-surface-hover p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => switchTab(t)}
            className={cn(
              "pressable rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer",
              tab === t ? "bg-surface shadow-sm" : "text-muted hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
        {dirty && <span className="ml-2 text-xs text-warning">Unsaved changes</span>}
      </div>

      {tab === "Edit" ? (
        <div className="overflow-x-auto overflow-y-hidden rounded-xl bg-surface-hover p-4">
          <CaseDocEditor
            initialDoc={liveContent ?? initialDoc}
            editable={editable}
            apiRef={editorApi}
            docVars={docVars}
            onDirty={() => setDirty(true)}
            onChangeJson={(doc) => setLiveContent(doc)}
            onInvalidContent={() => {
              // A corrupt or outdated draft: rebuild from the frozen snapshot
              // rather than letting Tiptap fall back to an empty document that
              // the next save would persist over the real one.
              const rebuilt = buildCaseDoc(sourceData.case, sourceData.patient, sourceData.company);
              editorApi.current?.setContent(rebuilt);
              setLiveContent(rebuilt);
              setDirty(true);
              toast.error("Document could not be read — rebuilt from the template. Check before saving.");
            }}
          />
        </div>
      ) : (
        <div className="h-[80vh] overflow-hidden rounded-xl border border-border bg-surface-hover">
          {busy === "preview" ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              <Loader2 className="mr-2 size-4 animate-spin" /> Rendering PDF…
            </div>
          ) : previewError ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-danger">
              Preview failed: {previewError}
            </div>
          ) : previewUrl ? (
            <iframe
              src={`${previewUrl}#toolbar=0&navpanes=0`}
              className="size-full border-0"
              title="Document preview"
            />
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={onReset}
        pending={busy === "reset"}
        title="Reset document"
        confirmLabel="Reset"
        description="Discard every edit and rebuild this document from the case data? This cannot be undone."
      />
      <ConfirmDialog
        open={confirmFinalize}
        onClose={() => setConfirmFinalize(false)}
        onConfirm={onFinalize}
        pending={busy === "finalize"}
        title="Finalize document"
        confirmLabel="Finalize"
        description="Lock this document so it can no longer be edited. The database enforces this — it cannot be undone from the app."
      />
    </div>
  );
}
