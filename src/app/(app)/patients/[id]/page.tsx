import { notFound } from "next/navigation";
import { createClient, requireProfile } from "@/lib/supabase/server";
import { getQuoteItemsForCases } from "@/lib/actions/cases";
import { getDirectories } from "@/lib/data/directory";
import { PatientDetail } from "@/components/patients/patient-detail";
import type { Case, Patient, QuoteItem } from "@/lib/types";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("*, countries(name), profiles(name)")
    .eq("id", id)
    .single();
  if (!patient) notFound();

  const [
    { data: cases },
    directories,
    { data: templates },
    { data: files },
  ] = await Promise.all([
    supabase
      .from("cases")
      .select("*, operation_types(name), doctors(name), hospitals(name), hotels(name), drivers(name)")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    getDirectories(),
    supabase.from("instruction_templates").select("id, title").order("title"),
    supabase.from("patient_files").select("*").eq("patient_id", id).order("created_at", { ascending: false }),
  ]);
  const { countries, agents, doctors, hospitals, hotels, drivers, operationTypes } = directories;

  const caseIds = (cases ?? []).map((c) => c.id);
  const [{ data: payments }, { data: instructions }, quoteItemsRaw] = await Promise.all([
    caseIds.length
      ? supabase.from("payments").select("*").in("case_id", caseIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    caseIds.length
      ? supabase.from("case_instructions").select("*").in("case_id", caseIds).order("created_at")
      : Promise.resolve({ data: [] }),
    getQuoteItemsForCases(caseIds),
  ]);

  const quoteItemsByCase = quoteItemsRaw as unknown as Record<string, QuoteItem[]>;

  return (
    <PatientDetail
      patient={patient as Patient}
      cases={(cases ?? []) as Case[]}
      quoteItemsByCase={quoteItemsByCase}
      payments={
        profile.role === "admin"
          ? (payments ?? [])
          : (payments ?? []).filter((p) => p.counterparty_type !== "doctor")
      }
      instructions={instructions ?? []}
      files={files ?? []}
      isAdmin={profile.role === "admin"}
      currentUserId={profile.id}
      directories={{
        countries: countries ?? [],
        agents: agents ?? [],
        doctors: doctors ?? [],
        hospitals: hospitals ?? [],
        hotels: hotels ?? [],
        drivers: drivers ?? [],
        operationTypes: operationTypes ?? [],
        templates: templates ?? [],
      }}
    />
  );
}
