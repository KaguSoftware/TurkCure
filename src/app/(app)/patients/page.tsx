import { createClient, requireProfile } from "@/lib/supabase/server";
import { getDirectories } from "@/lib/data/directory";
import { PatientsView } from "@/components/patients/patients-view";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Upload } from "lucide-react";
import type { Patient, PatientStatus } from "@/lib/types";
import { PATIENT_STATUSES } from "@/lib/types";

export const metadata = { title: "Patients" };

const PATIENTS_PAGE_SIZE = 50;

// Columns the patients list/board renders, plus the fields the edit dialog
// (openable from the board) needs. Still narrower and faster than select("*").
const PATIENT_LIST_COLUMNS =
  "id, full_name, email, phone, source, status, country_id, assigned_agent_id, created_at, date_of_birth, gender, passport_number, notes, countries(name), profiles(name)";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; agent?: string; country?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const status = PATIENT_STATUSES.includes(params.status as PatientStatus)
    ? (params.status as PatientStatus)
    : null;
  const page = Math.max(1, Number(params.page) || 1);

  const profile = await requireProfile();
  const supabase = await createClient();

  let query = supabase
    .from("patients")
    .select(PATIENT_LIST_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PATIENTS_PAGE_SIZE, page * PATIENTS_PAGE_SIZE - 1);
  if (q) {
    const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
    query = query.or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
  }
  if (status) query = query.eq("status", status);
  if (params.agent) query = query.eq("assigned_agent_id", params.agent);
  if (params.country) query = query.eq("country_id", params.country);

  const [{ data: patients, count }, directories] = await Promise.all([query, getDirectories()]);
  const { countries, agents, doctors, hospitals, hotels, drivers, operationTypes } = directories;

  return (
    <>
      <PageHeader title="Patients" subtitle="Pipeline from lead to aftercare">
        <Link href="/patients/import">
          <Button variant="secondary">
            <Upload /> Import CSV
          </Button>
        </Link>
      </PageHeader>
      <PatientsView
        patients={(patients ?? []) as unknown as Patient[]}
        total={count ?? 0}
        page={page}
        pageSize={PATIENTS_PAGE_SIZE}
        countries={countries ?? []}
        agents={agents ?? []}
        currentUserId={profile.id}
        isAdmin={profile.role === "admin"}
        caseDirectories={{
          doctors: doctors ?? [],
          hospitals: hospitals ?? [],
          hotels: hotels ?? [],
          drivers: drivers ?? [],
          operationTypes: operationTypes ?? [],
        }}
      />
    </>
  );
}
