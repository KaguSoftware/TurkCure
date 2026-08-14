"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireProfile, requireAdmin } from "@/lib/supabase/server";

/**
 * The editable case document (0021). Reads and writes go through the ordinary
 * cookie client: the table carries no cost column and never reaches
 * finance_case_rows(), so RLS lets staff write it directly.
 *
 * Note there is no finance revalidation here for the same reason — this
 * document is presentation only and moves no numbers.
 */

export interface CaseDocumentRow {
  id: string;
  case_id: string;
  content: unknown;
  source_data: unknown;
  status: "draft" | "finalized";
  finalized_at: string | null;
  updated_at: string;
}

/** The stored document for a case, or null when none has been created yet. */
export async function getCaseDocument(caseId: string): Promise<CaseDocumentRow | null> {
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("case_documents")
    .select("id, case_id, content, source_data, status, finalized_at, updated_at")
    .eq("case_id", caseId)
    .maybeSingle();
  return (data as CaseDocumentRow | null) ?? null;
}

/**
 * Creates or updates the draft. `source_data` is only written on insert — it is
 * the snapshot the document was seeded from, and "reset to template" needs it to
 * stay as it was rather than tracking later edits.
 */
export async function upsertCaseDocument(
  patientId: string,
  caseId: string,
  content: unknown,
  sourceData?: unknown
): Promise<{ error?: string; id?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("case_documents")
    .select("id, status")
    .eq("case_id", caseId)
    .maybeSingle();

  if (existing) {
    // The DB trigger enforces this too; checking here turns a raised exception
    // into a message the UI can show.
    if (existing.status === "finalized")
      return { error: "This document is finalized and can no longer be edited." };
    const { error } = await supabase
      .from("case_documents")
      .update({ content })
      .eq("id", existing.id);
    if (error) return { error: error.message };
    revalidatePath(`/patients/${patientId}`);
    return { id: existing.id };
  }

  const { data, error } = await supabase
    .from("case_documents")
    .insert({ case_id: caseId, content, source_data: sourceData ?? {} })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/patients/${patientId}`);
  return { id: data.id };
}

/** Locks the document. Admin-only, and the DB trigger enforces it thereafter. */
export async function finalizeCaseDocument(
  patientId: string,
  caseId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("case_documents")
    .update({ status: "finalized", finalized_at: new Date().toISOString() })
    .eq("case_id", caseId);
  if (error) return { error: error.message };
  revalidatePath(`/patients/${patientId}`);
  return {};
}

/**
 * Replaces the draft's content with a freshly built document. The caller builds
 * it (buildCaseDoc lives client-safe), so this stays a plain write.
 */
export async function resetCaseDocument(
  patientId: string,
  caseId: string,
  content: unknown
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("case_documents")
    .update({ content })
    .eq("case_id", caseId)
    .eq("status", "draft");
  if (error) return { error: error.message };
  revalidatePath(`/patients/${patientId}`);
  return {};
}
