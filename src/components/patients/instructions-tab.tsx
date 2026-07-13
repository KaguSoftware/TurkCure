"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileDown, ImagePlus, Plus, Save, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { uploadInstructionImage } from "@/lib/upload-instruction-image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { attachInstruction, updateInstruction, removeInstruction } from "@/lib/actions/cases";
import { useOptimisticList, tempId } from "@/lib/use-optimistic-list";
import type { Case, CaseInstruction, Patient } from "@/lib/types";

export function InstructionsTab({
  patient,
  cases,
  instructions: serverInstructions,
  templates,
}: {
  patient: Patient;
  cases: Case[];
  instructions: CaseInstruction[];
  templates: { id: string; title: string }[];
}) {
  const activeCase = cases[0] ?? null;
  const { items: instructions, mutate, pending: busy } =
    useOptimisticList<CaseInstruction>(serverInstructions);
  const [templateId, setTemplateId] = React.useState("");

  if (!activeCase) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">
          Create a case first — instructions are attached to the case and included in the patient PDF.
        </CardContent>
      </Card>
    );
  }

  async function onAttach() {
    if (!templateId) return;
    const template = templates.find((t) => t.id === templateId);
    const temp = {
      id: tempId(),
      case_id: activeCase!.id,
      template_id: templateId,
      title: template?.title ?? "",
      body_md: "",
      image_paths: [],
    } as unknown as CaseInstruction;
    setTemplateId("");
    await mutate({
      optimistic: (prev) => [...prev, temp],
      action: () => attachInstruction(patient.id, activeCase!.id, templateId),
      success: "Instructions attached.",
      reconcile: (r, prev) =>
        r?.instruction
          ? prev.map((i) => (i.id === temp.id ? (r.instruction as unknown as CaseInstruction) : i))
          : prev,
    });
  }

  async function onRemove(instruction: CaseInstruction) {
    await mutate({
      optimistic: (prev) => prev.filter((i) => i.id !== instruction.id),
      action: () => removeInstruction(patient.id, instruction.id),
      success: "Instructions removed.",
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex max-w-md items-end gap-2">
        <div className="flex-1">
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Choose a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={onAttach} disabled={!templateId} pending={busy}>
          <Plus /> Attach
        </Button>
      </div>

      {instructions.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted">
            No instructions attached yet. Attach a template above — you can customize the text and
            add images per patient before generating the PDF.
          </CardContent>
        </Card>
      )}

      {instructions.map((ins) => (
        <InstructionCard
          key={ins.id}
          patientId={patient.id}
          instruction={ins}
          onRemove={() => onRemove(ins)}
        />
      ))}
    </div>
  );
}

function InstructionCard({
  patientId,
  instruction,
  onRemove,
}: {
  patientId: string;
  instruction: CaseInstruction;
  onRemove: () => Promise<void>;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState(instruction.body_md);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [thumbs, setThumbs] = React.useState<Record<string, string>>({});
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  // Image path staged for removal (null = no dialog); separate pending flag.
  const [confirmRemoveImage, setConfirmRemoveImage] = React.useState<string | null>(null);
  const [imageRemoving, setImageRemoving] = React.useState(false);
  const dirty = body !== instruction.body_md;
  const images = instruction.image_paths ?? [];

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (images.length === 0) return;
      const supabase = createClient();
      const { data } = await supabase.storage
        .from("patient-files")
        .createSignedUrls(images, 3600);
      if (!cancelled && data) {
        const map: Record<string, string> = {};
        data.forEach((d, i) => {
          if (d.signedUrl) map[images[i]] = d.signedUrl;
        });
        setThumbs(map);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(images)]);

  async function setImagePaths(paths: string[]) {
    const supabase = createClient();
    const { error } = await supabase
      .from("case_instructions")
      .update({ image_paths: paths })
      .eq("id", instruction.id);
    if (error) toast.error(error.message);
    else React.startTransition(() => router.refresh());
  }

  async function onAddImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const supabase = createClient();
    const path = `instructions/${instruction.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("patient-files").upload(path, file);
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Image added.");
    await setImagePaths([...images, path]);
  }

  async function onRemoveImage(path: string) {
    setImageRemoving(true);
    const supabase = createClient();
    const { error } = await supabase.storage.from("patient-files").remove([path]);
    if (error) {
      setImageRemoving(false);
      setConfirmRemoveImage(null);
      toast.error(`Couldn't remove image: ${error.message}`);
      return;
    }
    await setImagePaths(images.filter((p) => p !== path));
    setImageRemoving(false);
    setConfirmRemoveImage(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="min-w-0 truncate">{instruction.title}</CardTitle>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {dirty && (
            <Button
              size="sm"
              disabled={saving}
              pending={saving}
              onClick={async () => {
                setSaving(true);
                const r = await updateInstruction(patientId, instruction.id, body);
                setSaving(false);
                if (r.error) toast.error(r.error);
                else {
                  toast.success("Instructions saved.");
                  React.startTransition(() => router.refresh());
                }
              }}
            >
              <Save /> Save
            </Button>
          )}
          <a href={`/api/pdf/instruction/${instruction.id}`} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm">
              <FileDown /> Download PDF
            </Button>
          </a>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove"
            className="hover:text-danger"
            onClick={() => setConfirmRemove(true)}
          >
            <Trash2 />
          </Button>
        </div>
        <ConfirmDialog
          open={confirmRemove}
          onClose={() => setConfirmRemove(false)}
          onConfirm={async () => {
            setRemoving(true);
            await onRemove();
            // On success the card unmounts; if it's still here the action failed.
            setRemoving(false);
            setConfirmRemove(false);
          }}
          pending={removing}
          title="Remove instructions"
          confirmLabel="Remove"
          description={
            <>
              Remove <strong>{instruction.title}</strong> from this case? It will no longer appear
              in the patient PDF.
            </>
          }
        />
      </CardHeader>
      <CardContent className="space-y-3">
        <MarkdownEditor
          value={body}
          onChange={setBody}
          rows={12}
          uploadImage={(file) => uploadInstructionImage(file, `cases/${instruction.id}`)}
        />
        <div className="flex flex-wrap items-center gap-3">
          {images.map((path) => (
            <div key={path} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbs[path]}
                alt=""
                className="h-20 w-20 rounded-lg border border-border object-cover"
              />
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => setConfirmRemoveImage(path)}
                className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-danger p-0.5 text-white group-hover:block cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border-strong text-muted transition-colors hover:border-primary hover:text-primary">
            <ImagePlus className="size-5" />
            <span className="text-[10px] font-medium">{uploading ? "…" : "Image"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={onAddImage} disabled={uploading} />
          </label>
        </div>
        <p className="text-xs text-muted-light">
          Images are included in the instruction PDF and the patient confirmation PDF.
        </p>
      </CardContent>

      <ConfirmDialog
        open={confirmRemoveImage !== null}
        onClose={() => setConfirmRemoveImage(null)}
        onConfirm={() => confirmRemoveImage && onRemoveImage(confirmRemoveImage)}
        pending={imageRemoving}
        title="Remove image"
        confirmLabel="Remove"
        description="Remove this image from the instructions? It will be deleted from storage and the PDF."
      />
    </Card>
  );
}
