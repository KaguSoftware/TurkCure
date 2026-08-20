import { notFound } from "next/navigation";
import { createClient, requireProfile } from "@/lib/supabase/server";
import { getOrganization } from "@/lib/data/org";
import { loadCaseData } from "@/lib/pdf/case-doc";
import { buildCaseDoc } from "@/lib/documents/buildCaseDoc";
import { getCaseDocument } from "@/lib/actions/case-documents";
import { DocumentEditorPage } from "@/components/documents/DocumentEditorPage";
import { orgToPdfTheme, orgToDocVars, DEFAULT_PDF_THEME } from "@/lib/pdf/theme";
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
  // snapshot "reset to template" rebuilds from. The org rides along so the
  // seed and the client-side rebuilds carry this org's identity.
  const [loaded, org] = await Promise.all([
    loadCaseData(supabase, caseId),
    getOrganization(profile.org_id),
  ]);
  if (!loaded) notFound();
  const { case: caseData, patient } = loaded;

  const theme = org ? orgToPdfTheme(org) : DEFAULT_PDF_THEME;
  const stored = await getCaseDocument(caseId);
  const initialDoc =
    (stored?.content as EditorDocJSON | undefined) ??
    buildCaseDoc(caseData, patient, theme.company);

  return (
    <DocumentEditorPage
      patientId={id}
      patientName={patient.full_name}
      caseId={caseId}
      initialDoc={initialDoc}
      sourceData={{ case: caseData, patient, company: theme.company }}
      docVars={orgToDocVars(theme)}
      status={stored?.status ?? "draft"}
      isAdmin={profile.role === "admin"}
    />
  );
}
