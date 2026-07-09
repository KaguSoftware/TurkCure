import { redirect } from "next/navigation";
import { createAdminClient, getProfile } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { FinanceView, type CaseFinance } from "@/components/finance/finance-view";

export const metadata = { title: "Finance" };

export default async function FinancePage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  const admin = createAdminClient();
  // Exclude cancelled cases — they never earned or cost anything and only
  // inflate the totals. Pull incoming paid payments to compute collected cash.
  const { data: cases } = await admin
    .from("cases")
    .select(
      "id, currency, created_at, surgery_date, status, patients(id, full_name), operation_types(name), quote_items(cost, price), payments(direction, status, amount, currency)"
    )
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  const rows: CaseFinance[] = (cases ?? []).map((c) => {
    const items = (c.quote_items ?? []) as { cost: number; price: number }[];
    const revenue = items.reduce((s, i) => s + Number(i.price), 0);
    const cost = items.reduce((s, i) => s + Number(i.cost), 0);
    // Collected = incoming, paid, in the case currency (same basis as the
    // per-case reconciliation so the two screens agree).
    const pays = (c.payments ?? []) as {
      direction: string;
      status: string;
      amount: number;
      currency: string;
    }[];
    const collected = pays
      .filter((p) => p.direction === "in" && p.status === "paid" && p.currency === c.currency)
      .reduce((s, p) => s + Number(p.amount), 0);
    const patient = c.patients as unknown as { id: string; full_name: string } | null;
    const op = c.operation_types as unknown as { name: string } | null;
    return {
      id: c.id,
      patientId: patient?.id ?? "",
      patientName: patient?.full_name ?? "—",
      operation: op?.name ?? "—",
      currency: c.currency,
      status: c.status,
      // Attribute every case by surgery month, falling back to creation month
      // only when no surgery date is set yet.
      month: (c.surgery_date ?? c.created_at).slice(0, 7),
      revenue,
      cost,
      collected,
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
