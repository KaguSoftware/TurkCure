import { notFound } from "next/navigation";
import { createClient, requireProfile } from "@/lib/supabase/server";
import { getQuoteItemsForPatient } from "@/lib/actions/cases";
import { getDirectories } from "@/lib/data/directory";
import { PatientDetail } from "@/components/patients/patient-detail";
import type { Case, Patient, QuoteItem } from "@/lib/types";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  // Everything in one parallel round trip: payments and instructions ride
  // along nested in the cases query (flattened + sorted below), and quote
  // items are fetched by patient so nothing has to wait for case ids.
  const [
    { data: patient },
    { data: casesRaw },
    directories,
    { data: templates },
    { data: files },
    quoteItemsRaw,
  ] = await Promise.all([
    supabase
      .from("patients")
      .select("*, countries(name), profiles(name)")
      .eq("id", id)
      .single(),
    supabase
      .from("cases")
      .select(
        "*, operation_types(name), doctors(name), hospitals(name), hotels(name), drivers(name), payments(*), case_instructions(*)"
      )
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    getDirectories(),
    supabase.from("instruction_templates").select("id, title").order("title"),
    supabase.from("patient_files").select("*").eq("patient_id", id).order("created_at", { ascending: false }),
    getQuoteItemsForPatient(id),
  ]);
  if (!patient) notFound();
  const { countries, agents, doctors, hospitals, hotels, drivers, operationTypes } = directories;

  const cases = (casesRaw ?? []).map(({ payments, case_instructions, ...c }) => c);
  const payments = (casesRaw ?? [])
    .flatMap((c) => c.payments ?? [])
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const instructions = (casesRaw ?? [])
    .flatMap((c) => c.case_instructions ?? [])
    .sort((a, b) => (a.created_at > b.created_at ? 1 : -1));

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
