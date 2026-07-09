"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileDown, ImagePlus, Plus, Save, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { attachInstruction, updateInstruction, removeInstruction } from "@/lib/actions/cases";
import type { Case, CaseInstruction, Patient } from "@/lib/types";

export function InstructionsTab({
  patient,
  cases,
  instructions,
  templates,
}: {
  patient: Patient;
  cases: Case[];
  instructions: CaseInstruction[];
  templates: { id: string; title: string }[];
}) {
  const activeCase = cases[0] ?? null;
  const [templateId, setTemplateId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

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
    setBusy(true);
    const r = await attachInstruction(patient.id, activeCase!.id, templateId);
    setBusy(false);
    if (r.error) alert(r.error);
    else setTemplateId("");
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
        <Button onClick={onAttach} disabled={!templateId || busy}>
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
        <InstructionCard key={ins.id} patientId={patient.id} instruction={ins} />
      ))}
    </div>
  );
}

function InstructionCard({
  patientId,
  instruction,
}: {
  patientId: string;
  instruction: CaseInstruction;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState(instruction.body_md);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [thumbs, setThumbs] = React.useState<Record<string, string>>({});
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
    if (error) alert(error.message);
    else router.refresh();
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
      alert(error.message);
      return;
    }
    await setImagePaths([...images, path]);
  }

  async function onRemoveImage(path: string) {
    const supabase = createClient();
    await supabase.storage.from("patient-files").remove([path]);
    await setImagePaths(images.filter((p) => p !== path));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{instruction.title}</CardTitle>
        <div className="flex gap-1">
          {dirty && (
            <Button
              size="sm"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                const r = await updateInstruction(patientId, instruction.id, body);
                setSaving(false);
                if (r.error) alert(r.error);
              }}
            >
              <Save /> {saving ? "Saving…" : "Save"}
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
            onClick={async () => {
              if (!confirm("Remove these instructions from the case?")) return;
              const r = await removeInstruction(patientId, instruction.id);
              if (r.error) alert(r.error);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="font-mono text-xs"
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
                onClick={() => onRemoveImage(path)}
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
    </Card>
  );
}
