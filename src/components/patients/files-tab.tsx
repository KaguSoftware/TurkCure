"use client";

import * as React from "react";
import { Download, FileText, Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useOptimisticList, tempId } from "@/lib/use-optimistic-list";
import { formatDate } from "@/lib/utils";
import { FILE_CATEGORIES } from "@/lib/types";
import type { FileCategory, Patient, PatientFile } from "@/lib/types";

// Reports and passports are always a scan or a PDF; the Other bucket stays open.
const SCAN_ACCEPT = "image/*,application/pdf";
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
// Browser-renderable inline. HEIC/TIFF scans exist but no browser shows them —
// those fall back to download.
const PDF_RE = /\.pdf$/i;
// Storage isn't free and a 500 MB pick used to be accepted silently, blocking
// all three inputs for minutes. Scans and reports don't come close to this.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function FilesTab({
  patient,
  files: serverFiles,
  currentUserId,
  agents = [],
}: {
  patient: Patient;
  files: PatientFile[];
  currentUserId: string;
  agents?: { id: string; name: string }[];
}) {
  const { items: files, mutate, pending } = useOptimisticList<PatientFile>(serverFiles);
  const [uploading, setUploading] = React.useState<FileCategory | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<PatientFile | null>(null);
  // In-app preview for images and PDFs (signed URL in a dialog) — before this
  // every look at a file meant a new browser tab.
  const [preview, setPreview] = React.useState<{ file: PatientFile; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState<string | null>(null);
  const agentName = React.useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);

  // Group once rather than filtering the list per section. Files predating the
  // categories (or written by an older client) fall back to "other".
  const byCategory = React.useMemo(() => {
    const groups: Record<FileCategory, PatientFile[]> = { reports: [], passport: [], other: [] };
    for (const f of files) (groups[f.category] ?? groups.other).push(f);
    return groups;
  }, [files]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>, category: FileCategory) {
    const file = e.target.files?.[0];
    // Reset the input so re-picking the same file fires change again.
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `${file.name} is ${(file.size / (1024 * 1024)).toFixed(0)} MB — the limit is 25 MB.`
      );
      return;
    }
    setUploading(category);
    setError(null);
    const temp = {
      id: tempId(),
      patient_id: patient.id,
      storage_path: "",
      label: file.name,
      category,
      uploaded_by: currentUserId,
      created_at: new Date().toISOString(),
    } as unknown as PatientFile;
    const { ok, result } = await mutate({
      optimistic: (prev) => [temp, ...prev],
      action: async () => {
        const supabase = createClient();
        const path = `${patient.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("patient-files").upload(path, file);
        if (upErr) return { error: `Upload failed: ${upErr.message}` };
        const { data, error: dbErr } = await supabase
          .from("patient_files")
          .insert({
            patient_id: patient.id,
            storage_path: path,
            label: file.name,
            category,
            uploaded_by: currentUserId,
          })
          .select("*")
          .single();
        if (dbErr) return { error: dbErr.message };
        return { row: data as PatientFile };
      },
      success: `${file.name} uploaded.`,
      reconcile: (r, prev) =>
        r && "row" in r && r.row ? prev.map((f) => (f.id === temp.id ? r.row! : f)) : prev,
    });
    setUploading(null);
    if (!ok && result?.error) setError(result.error);
  }

  async function onRecategorize(f: PatientFile, category: FileCategory) {
    if (category === f.category) return;
    const label = FILE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
    await mutate({
      optimistic: (prev) => prev.map((x) => (x.id === f.id ? { ...x, category } : x)),
      action: async () => {
        const supabase = createClient();
        const { error } = await supabase
          .from("patient_files")
          .update({ category })
          .eq("id", f.id);
        return error ? { error: error.message } : {};
      },
      success: `${f.label} moved to ${label}.`,
    });
  }

  async function onDownload(f: PatientFile) {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("patient-files")
      .createSignedUrl(f.storage_path, 300);
    if (error || !data) {
      toast.error(error?.message ?? "Could not create download link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function onPreview(f: PatientFile) {
    // Only images and PDFs render inline; everything else downloads.
    if (!IMAGE_RE.test(f.label) && !PDF_RE.test(f.label)) {
      onDownload(f);
      return;
    }
    setPreviewLoading(f.id);
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("patient-files")
      .createSignedUrl(f.storage_path, 300);
    setPreviewLoading(null);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open the file");
      return;
    }
    setPreview({ file: f, url: data.signedUrl });
  }

  async function onDelete(f: PatientFile) {
    // Keep the confirm dialog open with a spinner until the delete resolves.
    await mutate({
      optimistic: (prev) => prev.filter((x) => x.id !== f.id),
      action: async () => {
        const supabase = createClient();
        await supabase.storage.from("patient-files").remove([f.storage_path]);
        const { error } = await supabase.from("patient_files").delete().eq("id", f.id);
        return error ? { error: error.message } : {};
      },
      success: `${f.label} deleted.`,
    });
    setConfirmDelete(null);
  }

  return (
    <div className="max-w-2xl space-y-7">
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      {FILE_CATEGORIES.map((cat) => {
        const rows = byCategory[cat.value];
        return (
          <section key={cat.value}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold">{cat.label}</h3>
              {rows.length > 0 && (
                <span className="text-xs tabular-nums text-muted-light">{rows.length}</span>
              )}
            </div>

            {rows.length === 0 ? (
              <p className="text-xs text-muted-light">{cat.hint}</p>
            ) : (
              <div className="space-y-2">
                {rows.map((f) => {
                  const Icon = IMAGE_RE.test(f.label) ? ImageIcon : FileText;
                  return (
                    <Card key={f.id} className="animate-pop">
                      {/* Wraps below sm: filename + category select + two icon
                          buttons is the tightest row in the app at 390px. */}
                      <CardContent className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
                        <button
                          type="button"
                          onClick={() => onPreview(f)}
                          disabled={previewLoading !== null}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                        >
                          {previewLoading === f.id ? (
                            <Loader2 className="size-4 shrink-0 animate-spin text-muted" />
                          ) : (
                            <Icon className="size-4 shrink-0 text-muted" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium hover:text-primary">
                              {f.label}
                            </p>
                            <p className="text-xs text-muted">
                              {formatDate(f.created_at)}
                              {f.uploaded_by && agentName.get(f.uploaded_by) && (
                                <span> · {agentName.get(f.uploaded_by)}</span>
                              )}
                            </p>
                          </div>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          {/* Re-file a mistake without re-uploading. Disabled while
                              another mutation is in flight — the optimistic list
                              rolls back from a single snapshot. */}
                          <Select
                            className="w-28 sm:w-32"
                            aria-label={`Category for ${f.label}`}
                            value={f.category}
                            disabled={pending}
                            onChange={(e) => onRecategorize(f, e.target.value as FileCategory)}
                          >
                            {FILE_CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Download"
                            onClick={() => onDownload(f)}
                          >
                            <Download />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            className="hover:text-danger"
                            onClick={() => setConfirmDelete(f)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* One drop target per section, so the category never has to be picked.
                The input is sr-only rather than hidden so it stays keyboard
                reachable; the label mirrors its focus ring. */}
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] has-[:disabled]:cursor-default has-[:disabled]:opacity-60">
              <Upload className="size-4" />
              <span>
                {uploading === cat.value ? "Uploading…" : `Add to ${cat.label.toLowerCase()}`}
              </span>
              <input
                type="file"
                className="sr-only"
                accept={cat.value === "other" ? undefined : SCAN_ACCEPT}
                onChange={(e) => onUpload(e, cat.value)}
                disabled={uploading !== null}
              />
            </label>
          </section>
        );
      })}

      {/* Signed URLs live 300s; the dialog is transient so that's plenty. */}
      <Dialog
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.file.label ?? "Preview"}
        wide
      >
        {preview && (
          <div className="space-y-3">
            {IMAGE_RE.test(preview.file.label) ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
              <img
                src={preview.url}
                alt={preview.file.label}
                className="mx-auto max-h-[65vh] w-auto max-w-full rounded-lg"
              />
            ) : (
              <iframe
                src={preview.url}
                title={preview.file.label}
                className="h-[65vh] w-full rounded-lg border border-border"
              />
            )}
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => onDownload(preview.file)}>
                <Download /> Download
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && onDelete(confirmDelete)}
        pending={pending}
        title="Delete file"
        description={
          <>
            Permanently delete <strong>{confirmDelete?.label}</strong>? This cannot be undone.
          </>
        }
      />
    </div>
  );
}
