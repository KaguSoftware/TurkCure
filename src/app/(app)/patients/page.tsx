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

// Table-mode sort options (?sort= / ?dir=). Board mode ignores them.
const SORT_COLUMNS = {
  created: "created_at",
  name: "full_name",
  status: "status",
} as const;
export type PatientSortKey = keyof typeof SORT_COLUMNS;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    agent?: string;
    country?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const status = PATIENT_STATUSES.includes(params.status as PatientStatus)
    ? (params.status as PatientStatus)
    : null;
  // Clamp both ends and floor: `?page=2.5` or `?page=999999` used to flow
  // straight into .range() (empty grid, no way back).
  const page = Math.min(10_000, Math.max(1, Math.floor(Number(params.page) || 1)));
  const sort: PatientSortKey = params.sort && params.sort in SORT_COLUMNS
    ? (params.sort as PatientSortKey)
    : "created";
  const dir: "asc" | "desc" =
    params.dir === "asc" || params.dir === "desc"
      ? params.dir
      : sort === "created"
        ? "desc"
        : "asc";

  const profile = await requireProfile();
  const supabase = await createClient();

  let query = supabase
    .from("patients")
    .select(PATIENT_LIST_COLUMNS, { count: "exact" })
    .order(SORT_COLUMNS[sort], { ascending: dir === "asc" })
    .range((page - 1) * PATIENTS_PAGE_SIZE, page * PATIENTS_PAGE_SIZE - 1);
  // Stable tiebreaker so equal sort values keep a deterministic page split.
  if (sort !== "created") query = query.order("created_at", { ascending: false });
  if (q) {
    const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
    query = query.or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
  }
  if (status) query = query.eq("status", status);
  if (params.agent) query = query.eq("assigned_agent_id", params.agent);
  if (params.country) query = query.eq("country_id", params.country);

  const [{ data: patients, count }, directories, { data: statusCounts }] = await Promise.all([
    query,
    getDirectories(profile.org_id),
    // True per-status totals for the board columns — the loaded page is capped
    // at 50, so counting the page undercounts every column past page one.
    supabase.rpc("patient_status_counts"),
  ]);
  const { countries, agents, doctors, hospitals, hotels, drivers, operationTypes } = directories;
  const boardCounts: Record<string, number> = {};
  for (const row of (statusCounts ?? []) as { status: string; count: number }[])
    boardCounts[row.status] = Number(row.count);

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
        boardCounts={boardCounts}
        sort={sort}
        dir={dir}
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
