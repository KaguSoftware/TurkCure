"use client";

import * as React from "react";
import { Download, FileText, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useOptimisticList, tempId } from "@/lib/use-optimistic-list";
import { formatDate } from "@/lib/utils";
import { FILE_CATEGORIES } from "@/lib/types";
import type { FileCategory, Patient, PatientFile } from "@/lib/types";

// Reports and passports are always a scan or a PDF; the Other bucket stays open.
const SCAN_ACCEPT = "image/*,application/pdf";
const IMAGE_RE = /\.(png|jpe?g|gif|webp|heic|heif|avif|bmp|tiff?)$/i;

export function FilesTab({
  patient,
  files: serverFiles,
  currentUserId,
}: {
  patient: Patient;
  files: PatientFile[];
  currentUserId: string;
}) {
  const { items: files, mutate, pending } = useOptimisticList<PatientFile>(serverFiles);
  const [uploading, setUploading] = React.useState<FileCategory | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<PatientFile | null>(null);

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
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <Icon className="size-4 shrink-0 text-muted" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{f.label}</p>
                            <p className="text-xs text-muted">{formatDate(f.created_at)}</p>
                          </div>
                        </div>
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
