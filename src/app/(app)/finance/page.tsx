import { redirect } from "next/navigation";
import { createAdminClient, getProfile } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { FinanceView, type CaseFinance } from "@/components/finance/finance-view";

export const metadata = { title: "Finance" };

export default async function FinancePage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  const admin = createAdminClient();
  // Aggregated in Postgres (finance_case_rows): excludes cancelled cases,
  // revenue/cost from quote items, collected = incoming paid payments in the
  // case currency, month = surgery month falling back to creation month.
  const { data } = await admin.rpc("finance_case_rows");

  const rows: CaseFinance[] = ((data ?? []) as {
    id: string;
    patient_id: string | null;
    patient_name: string;
    operation: string;
    currency: string;
    status: string;
    month: string;
    revenue: number;
    cost: number;
    collected: number;
  }[]).map((r) => ({
    id: r.id,
    patientId: r.patient_id ?? "",
    patientName: r.patient_name,
    operation: r.operation,
    currency: r.currency,
    status: r.status,
    month: r.month,
    revenue: Number(r.revenue),
    cost: Number(r.cost),
    collected: Number(r.collected),
  }));

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle="Per-case margins and monthly performance — admin only"
      />
      <FinanceView rows={rows} />
    </>
  );
}
