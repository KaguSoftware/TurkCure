import { createClient, requireProfile } from "@/lib/supabase/server";
import { PatientsView } from "@/components/patients/patients-view";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Upload } from "lucide-react";
import type { Patient } from "@/lib/types";

export const metadata = { title: "Patients" };

export default async function PatientsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: patients }, { data: countries }, { data: agents }] = await Promise.all([
    supabase
      .from("patients")
      .select("*, countries(name), profiles(name)")
      .order("created_at", { ascending: false }),
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("profiles").select("id, name").eq("active", true).order("name"),
  ]);

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
        patients={(patients ?? []) as Patient[]}
        countries={countries ?? []}
        agents={agents ?? []}
        currentUserId={profile.id}
      />
    </>
  );
}
