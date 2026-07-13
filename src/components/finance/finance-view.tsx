"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { CURRENCIES, formatMoney, cn } from "@/lib/utils";
import { toUsd, FX_RATES_AS_OF } from "@/lib/fx";

// recharts loads only when the chart actually renders (client-only).
const FinanceChart = dynamic(() => import("./finance-chart"), {
  ssr: false,
  loading: () => <div className="h-72" />,
});

const TABLE_PAGE_SIZE = 50;

export interface CaseFinance {
  id: string;
  patientId: string;
  patientName: string;
  operation: string;
  currency: string;
  status: string;
  month: string; // YYYY-MM
  revenue: number;
  cost: number;
  /** Cash actually collected (incoming, paid, case currency). */
  collected: number;
}

// Palette validated with the dataviz six-checks validator per mode
const SERIES = {
  light: { revenue: "#2563eb", cost: "#b45309" },
  dark: { revenue: "#3b82f6", cost: "#d97706" },
};

export function FinanceView({ rows }: { rows: CaseFinance[] }) {
  const { resolvedTheme } = useTheme();
  const [currency, setCurrency] = React.useState("ALL");
  const [page, setPage] = React.useState(0);

  const colors = SERIES[resolvedTheme === "dark" ? "dark" : "light"];
  const isAll = currency === "ALL";
  const displayCurrency = isAll ? "USD" : currency;
  // In "All" mode every case is converted to USD; otherwise filter to one currency
  const filtered = React.useMemo(
    () =>
      isAll
        ? rows.map((r) => ({
            ...r,
            revenue: toUsd(r.revenue, r.currency),
            cost: toUsd(r.cost, r.currency),
            collected: toUsd(r.collected, r.currency),
          }))
        : rows.filter((r) => r.currency === currency),
    [rows, isAll, currency]
  );

  // Reset to the first page whenever the filter set changes.
  React.useEffect(() => setPage(0), [currency]);

  const { totalRevenue, totalCost, totalCollected } = React.useMemo(() => {
    let rev = 0,
      cost = 0,
      coll = 0;
    for (const r of filtered) {
      rev += r.revenue;
      cost += r.cost;
      coll += r.collected;
    }
    return { totalRevenue: rev, totalCost: cost, totalCollected: coll };
  }, [filtered]);
  const margin = totalRevenue - totalCost;
  const outstanding = totalRevenue - totalCollected;

  function exportCsv() {
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
      `Cost (${displayCurrency})`,
      `Margin (${displayCurrency})`,
    ];
    const lines = filtered.map((r) =>
      [
        r.patientName,
        r.operation,
        r.status,
        r.month,
        r.currency,
        r.revenue.toFixed(2),
        r.collected.toFixed(2),
        r.cost.toFixed(2),
        (r.revenue - r.cost).toFixed(2),
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

  const chartData = React.useMemo(() => {
    const byMonth = new Map<string, { revenue: number; cost: number }>();
    for (const r of filtered) {
      const entry = byMonth.get(r.month) ?? { revenue: 0, cost: 0 };
      entry.revenue += r.revenue;
      entry.cost += r.cost;
      byMonth.set(r.month, entry);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, v]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-GB", {
          month: "short",
          year: "2-digit",
        }),
        Revenue: v.revenue,
        Cost: v.cost,
      }));
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE));
  const pageRows = React.useMemo(
    () => filtered.slice(page * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE),
    [filtered, page]
  );

  const stat = (label: string, value: number, accent?: string, sub?: string) => (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold tabular-nums", accent)}>
          {formatMoney(value, displayCurrency)}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-light">{sub}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stat("Revenue (quoted)", totalRevenue)}
          {stat(
            "Collected",
            totalCollected,
            "text-success",
            outstanding > 0 ? `${formatMoney(outstanding, displayCurrency)} outstanding` : "Fully collected"
          )}
          {stat("Internal cost", totalCost)}
          {stat("Margin (quoted)", margin, margin >= 0 ? "text-success" : "text-danger")}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 md:ml-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download /> Export CSV
            </Button>
            <div className="w-36">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="ALL">All (in USD)</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {isAll && (
            <p className="text-right text-[10px] leading-tight text-muted-light">
              FX rates as of {FX_RATES_AS_OF}
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Monthly revenue vs. cost ({isAll ? "all currencies → USD" : currency})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              No quoted cases {isAll ? "" : `in ${currency} `}yet.
            </p>
          ) : (
            <FinanceChart data={chartData} colors={colors} displayCurrency={displayCurrency} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-case margins ({isAll ? "all currencies → USD" : currency})</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table className="border-0 shadow-none">
            <THead>
              <tr>
                <Th>Patient</Th>
                <Th>Operation</Th>
                <Th>Status</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="text-right">Collected</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Margin</Th>
              </tr>
            </THead>
            <TBody>
              {filtered.length === 0 && <EmptyRow colSpan={7} message="No cases in this currency." />}
              {pageRows.map((r) => {
                const m = r.revenue - r.cost;
                const fullyPaid = r.collected >= r.revenue && r.revenue > 0;
                return (
                  <Tr key={r.id}>
                    <Td className="font-medium">
                      <Link href={`/patients/${r.patientId}`} className="hover:text-primary">
                        {r.patientName}
                      </Link>
                    </Td>
                    <Td className="text-muted">{r.operation}</Td>
                    <Td className="capitalize text-muted">{r.status.replace("_", " ")}</Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(r.revenue, displayCurrency)}
                      {isAll && r.currency !== "USD" && (
                        <span className="ml-1 text-xs text-muted-light">({r.currency})</span>
                      )}
                    </Td>
                    <Td
                      className={cn(
                        "text-right tabular-nums",
                        fullyPaid ? "text-success" : "text-muted"
                      )}
                    >
                      {formatMoney(r.collected, displayCurrency)}
                    </Td>
                    <Td className="text-right tabular-nums text-muted">
                      {formatMoney(r.cost, displayCurrency)}
                    </Td>
                    <Td
                      className={cn(
                        "text-right font-medium tabular-nums",
                        m >= 0 ? "text-success" : "text-danger"
                      )}
                    >
                      {formatMoney(m, displayCurrency)}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
              <span>
                Showing {page * TABLE_PAGE_SIZE + 1}–
                {Math.min((page + 1) * TABLE_PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="tabular-nums">
                  {page + 1} / {pageCount}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
