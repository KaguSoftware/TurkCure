import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { getFinanceRows, getFinancePayments } from "@/lib/data/finance";
import { getUsdRates } from "@/lib/data/fx";
import { PageHeader } from "@/components/page-header";
import { FinanceView } from "@/components/finance/finance-view";
import type { CaseFinance, PaymentFinance } from "@/components/finance/finance-shared";

export const metadata = { title: "Finance" };

export default async function FinancePage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  // Two Postgres aggregates (both exclude cancelled cases, both cached per org
  // under the `finance:<org>` tag): per-case rows — revenue/cost from quote
  // items, collected and paid_out from normalized paid payments, month =
  // surgery month falling back to creation month — and the flat per-payment
  // feed the cash chart and receivables/payables derive from. USD rates ride
  // the hourly "fx" cache (genuinely global).
  const [caseData, paymentData, usdRates] = await Promise.all([
    getFinanceRows(profile.org_id),
    getFinancePayments(profile.org_id),
    getUsdRates(),
  ]);

  const rows: CaseFinance[] = caseData.map((r) => ({
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
    // `?? 0`/`?? "—"`: before 0019 is applied the RPC lacks these columns —
    // degrade to zeros instead of NaN.
    paidOut: Number(r.paid_out ?? 0),
    hospitalId: r.hospital_id ?? null,
    hospitalName: r.hospital_name ?? "—",
    doctorId: r.doctor_id ?? null,
    doctorName: r.doctor_name ?? "—",
    source: r.source ?? "",
    country: r.country ?? null,
  }));

  const payments: PaymentFinance[] = paymentData.map((p) => ({
    id: p.id,
    caseId: p.case_id,
    patientId: p.patient_id ?? "",
    patientName: p.patient_name,
    caseCurrency: p.case_currency,
    direction: p.direction,
    counterpartyType: p.counterparty_type,
    counterpartyName: p.counterparty_name,
    amount: Number(p.amount),
    currency: p.currency,
    amountCase: Number(p.amount_case),
    status: p.status,
    dueDate: p.due_date,
    paidAt: p.paid_at,
  }));

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle="Margins, cash flow and balances — admin only"
      />
      <FinanceView rows={rows} payments={payments} usdRates={usdRates} />
    </>
  );
}
