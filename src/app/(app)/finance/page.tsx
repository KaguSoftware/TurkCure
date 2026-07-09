import { redirect } from "next/navigation";
import { createAdminClient, getProfile } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { FinanceView, type CaseFinance } from "@/components/finance/finance-view";

export const metadata = { title: "Finance" };

export default async function FinancePage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  const admin = createAdminClient();
  const { data: cases } = await admin
    .from("cases")
    .select(
      "id, currency, created_at, surgery_date, status, patients(id, full_name), operation_types(name), quote_items(cost, price)"
    )
    .order("created_at", { ascending: false });

  const rows: CaseFinance[] = (cases ?? []).map((c) => {
    const items = (c.quote_items ?? []) as { cost: number; price: number }[];
    const revenue = items.reduce((s, i) => s + Number(i.price), 0);
    const cost = items.reduce((s, i) => s + Number(i.cost), 0);
    const patient = c.patients as unknown as { id: string; full_name: string } | null;
    const op = c.operation_types as unknown as { name: string } | null;
    return {
      id: c.id,
      patientId: patient?.id ?? "",
      patientName: patient?.full_name ?? "—",
      operation: op?.name ?? "—",
      currency: c.currency,
      status: c.status,
      month: (c.surgery_date ?? c.created_at).slice(0, 7),
      revenue,
      cost,
    };
  });

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
