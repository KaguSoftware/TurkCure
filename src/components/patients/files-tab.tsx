"use client";

import * as React from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { useOptimisticList, tempId } from "@/lib/use-optimistic-list";
import { formatDate } from "@/lib/utils";
import type { Patient, PatientFile } from "@/lib/types";

export function FilesTab({
  patient,
  files: serverFiles,
  currentUserId,
}: {
  patient: Patient;
  files: PatientFile[];
  currentUserId: string;
}) {
  const { items: files, mutate } = useOptimisticList<PatientFile>(serverFiles);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<PatientFile | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const temp = {
      id: tempId(),
      patient_id: patient.id,
      storage_path: "",
      label: file.name,
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
    setUploading(false);
    if (!ok && result?.error) setError(result.error);
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
    setConfirmDelete(null);
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
  }

  return (
    <div className="max-w-2xl space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong py-8 text-muted transition-colors hover:border-primary hover:text-primary">
        <Upload className="size-5" />
        <span className="text-sm font-medium">
          {uploading ? "Uploading…" : "Upload photo, scan or document"}
        </span>
        <input type="file" className="hidden" onChange={onUpload} disabled={uploading} />
      </label>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      {files.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No files uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <Card key={f.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted">{formatDate(f.created_at)}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" aria-label="Download" onClick={() => onDownload(f)}>
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
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && onDelete(confirmDelete)}
        pending={false}
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
