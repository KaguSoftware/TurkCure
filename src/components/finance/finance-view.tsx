"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TabBar, TabPanel } from "@/components/ui/tabs";
import { CURRENCIES } from "@/lib/utils";
import { toUsd } from "@/lib/fx";
import type { UsdRates } from "@/lib/data/fx";
import {
  type CaseFinance,
  type PaymentFinance,
  type Period,
  PERIOD_OPTIONS,
} from "./finance-shared";
import { FinanceOverview } from "./finance-overview";
import { FinanceReceivables } from "./finance-receivables";
import { FinanceBreakdowns } from "./finance-breakdowns";

const TABS = ["Overview", "Receivables & Payables", "Breakdowns"] as const;
type Tab = (typeof TABS)[number];

export function FinanceView({
  rows,
  payments,
  usdRates,
}: {
  rows: CaseFinance[];
  payments: PaymentFinance[];
  usdRates: UsdRates;
}) {
  // Tab lives in the URL (?tab=) so links, refresh and back land on the same view.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(urlTab ?? "") ? (urlTab as Tab) : "Overview";
  const setTab = (t: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", t);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };

  const [currency, setCurrency] = React.useState("ALL");
  const [period, setPeriod] = React.useState<Period>("all");
  // Planning cases carry quoted numbers for treatments that may never happen;
  // off by default so "Revenue (quoted)" isn't inflated by pipeline.
  const [includePlanning, setIncludePlanning] = React.useState(false);

  const isAll = currency === "ALL";
  const displayCurrency = isAll ? "USD" : currency;

  // In "All" mode every figure is converted to USD; otherwise filter to one
  // currency. Payments are already normalized to their case currency
  // (amount_case, rate frozen at booking), so the same two moves apply.
  const cases = React.useMemo(
    () =>
      isAll
        ? rows.map((r) => ({
            ...r,
            revenue: toUsd(r.revenue, r.currency, usdRates.rates),
            cost: toUsd(r.cost, r.currency, usdRates.rates),
            collected: toUsd(r.collected, r.currency, usdRates.rates),
            paidOut: toUsd(r.paidOut, r.currency, usdRates.rates),
          }))
        : rows.filter((r) => r.currency === currency),
    [rows, isAll, currency, usdRates.rates]
  );
  const pays = React.useMemo(
    () =>
      isAll
        ? payments.map((p) => ({
            ...p,
            amountCase: toUsd(p.amountCase, p.caseCurrency, usdRates.rates),
          }))
        : payments.filter((p) => p.caseCurrency === currency),
    [payments, isAll, currency, usdRates.rates]
  );
  const quotedCases = React.useMemo(
    () => (includePlanning ? cases : cases.filter((c) => c.status !== "planning")),
    [cases, includePlanning]
  );
  const planningCount = cases.length - quotedCases.length;

  // Receivables/payables are as-of-today balances, not period flows.
  const periodApplies = tab !== "Receivables & Payables";

  return (
    <div className="space-y-4">
      {/* One header line: tabs share their bottom border with the toolbar on
          desktop, so the controls sit on the tab row instead of floating in
          dead space above it. On a phone the controls stack first. */}
      <div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-6 lg:border-b lg:border-border">
          <div className="flex flex-wrap items-center gap-2 lg:order-2 lg:shrink-0 lg:pb-2">
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={includePlanning}
                onChange={(e) => setIncludePlanning(e.target.checked)}
              />
              Include planning cases
            </label>
            <div className="w-[8.75rem]">
              <Select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                disabled={!periodApplies}
                aria-label="Period"
              >
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-32">
              <Select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                aria-label="Currency"
              >
                <option value="ALL">All (in USD)</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportCsv(cases, displayCurrency)}
              disabled={cases.length === 0}
            >
              <Download /> Export CSV
            </Button>
          </div>
          <TabBar
            idBase="finance"
            tabs={TABS}
            value={tab}
            onChange={setTab}
            className="lg:order-1 lg:min-w-0 lg:flex-1 lg:border-b-0"
          />
        </div>
        {isAll && (
          <p className="mt-1.5 text-right text-[10px] leading-tight text-muted-light">
            FX rates as of {usdRates.asOf}
            {usdRates.source === "fallback" && " (offline table)"}
          </p>
        )}
      </div>

      <TabPanel idBase="finance" index={TABS.indexOf(tab)}>
        {tab === "Overview" && (
          <FinanceOverview
            cases={cases}
            quotedCases={quotedCases}
            planningCount={planningCount}
            pays={pays}
            period={period}
            displayCurrency={displayCurrency}
            isAll={isAll}
            currency={currency}
          />
        )}
        {tab === "Receivables & Payables" && (
          <FinanceReceivables
            quotedCases={quotedCases}
            pays={pays}
            displayCurrency={displayCurrency}
          />
        )}
        {tab === "Breakdowns" && (
          <FinanceBreakdowns
            cases={cases}
            quotedCases={quotedCases}
            pays={pays}
            period={period}
            displayCurrency={displayCurrency}
          />
        )}
      </TabPanel>
    </div>
  );
}

function exportCsv(cases: CaseFinance[], displayCurrency: string) {
  const esc = (v: string | number) => {
    const str = String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = [
    "Patient",
    "Operation",
    "Status",
    "Month",
    "Currency",
    `Revenue (${displayCurrency})`,
    `Collected (${displayCurrency})`,
    `Cost quoted (${displayCurrency})`,
    `Paid out (${displayCurrency})`,
    `Expected margin (${displayCurrency})`,
    `Actual margin (${displayCurrency})`,
  ];
  const lines = cases.map((r) =>
    [
      r.patientName,
      r.operation,
      r.status,
      r.month,
      r.currency,
      r.revenue.toFixed(2),
      r.collected.toFixed(2),
      r.cost.toFixed(2),
      r.paidOut.toFixed(2),
      (r.revenue - r.cost).toFixed(2),
      (r.collected - r.paidOut).toFixed(2),
    ]
      .map(esc)
      .join(",")
  );
  const csv = [header.map(esc).join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `turkcure-finance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
