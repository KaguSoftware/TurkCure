import { createClient, requireProfile } from "@/lib/supabase/server";
import { getDirectories } from "@/lib/data/directory";
import { PatientsView } from "@/components/patients/patients-view";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Upload } from "lucide-react";
import type { Patient } from "@/lib/types";

export const metadata = { title: "Patients" };

// Columns the patients list/board renders, plus the fields the edit dialog
// (openable from the board) needs. Still narrower and faster than select("*").
const PATIENT_LIST_COLUMNS =
  "id, full_name, email, phone, source, status, country_id, assigned_agent_id, created_at, date_of_birth, gender, passport_number, notes, countries(name), profiles(name)";

export default async function PatientsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: patients }, directories] = await Promise.all([
    supabase
      .from("patients")
      .select(PATIENT_LIST_COLUMNS)
      .order("created_at", { ascending: false }),
    getDirectories(),
  ]);
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
