import { notFound } from "next/navigation";
import { createClient, requireProfile } from "@/lib/supabase/server";
import { loadCaseData } from "@/lib/pdf/case-doc";
import { buildCaseDoc } from "@/lib/documents/buildCaseDoc";
import { getCaseDocument } from "@/lib/actions/case-documents";
import { DocumentEditorPage } from "@/components/documents/DocumentEditorPage";
import type { EditorDocJSON } from "@/lib/documents/blocks";

export default async function CaseDocumentPage({
  params,
}: {
  params: Promise<{ id: string; caseId: string }>;
}) {
  const { id, caseId } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  // The case data doubles as the seed for a new document and as the frozen
  // snapshot "reset to template" rebuilds from.
  const loaded = await loadCaseData(supabase, caseId);
  if (!loaded) notFound();
  const { case: caseData, patient } = loaded;

  const stored = await getCaseDocument(caseId);
  const initialDoc =
    (stored?.content as EditorDocJSON | undefined) ?? buildCaseDoc(caseData, patient);

  return (
    <DocumentEditorPage
      patientId={id}
      patientName={patient.full_name}
      caseId={caseId}
      initialDoc={initialDoc}
      sourceData={{ case: caseData, patient }}
      status={stored?.status ?? "draft"}
      isAdmin={profile.role === "admin"}
    />
  );
}
