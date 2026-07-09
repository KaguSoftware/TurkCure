import { notFound } from "next/navigation";
import { createClient, requireProfile } from "@/lib/supabase/server";
import { getQuoteItems } from "@/lib/actions/cases";
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
    { data: countries },
    { data: agents },
    { data: doctors },
    { data: hospitals },
    { data: hotels },
    { data: drivers },
    { data: operationTypes },
    { data: templates },
    { data: files },
  ] = await Promise.all([
    supabase
      .from("cases")
      .select("*, operation_types(name), doctors(name), hospitals(name), hotels(name), drivers(name)")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("profiles").select("id, name").eq("active", true).order("name"),
    supabase.from("doctors").select("id, name").order("name"),
    supabase.from("hospitals").select("id, name").order("name"),
    supabase.from("hotels").select("id, name").order("name"),
    supabase.from("drivers").select("id, name").order("name"),
    supabase.from("operation_types").select("id, name").order("name"),
    supabase.from("instruction_templates").select("id, title").order("title"),
    supabase.from("patient_files").select("*").eq("patient_id", id).order("created_at", { ascending: false }),
  ]);

  const caseIds = (cases ?? []).map((c) => c.id);
  const [{ data: payments }, { data: instructions }] = await Promise.all([
    caseIds.length
      ? supabase.from("payments").select("*").in("case_id", caseIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    caseIds.length
      ? supabase.from("case_instructions").select("*").in("case_id", caseIds).order("created_at")
      : Promise.resolve({ data: [] }),
  ]);

  const quoteItemsByCase: Record<string, QuoteItem[]> = {};
  for (const caseId of caseIds) {
    quoteItemsByCase[caseId] = (await getQuoteItems(caseId)) as unknown as QuoteItem[];
  }

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
