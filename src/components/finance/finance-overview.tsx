"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, cn } from "@/lib/utils";
import {
  type CaseFinance,
  type PaymentFinance,
  type Period,
  PERIOD_OPTIONS,
  periodRange,
  previousRange,
  inRange,
  deltaPct,
  monthLabel,
  Stat,
  Pager,
  TABLE_PAGE_SIZE,
} from "./finance-shared";

// recharts loads only when the chart actually renders (client-only).
const FinanceChart = dynamic(() => import("./finance-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-72 rounded-xl" />,
});

// Palette validated with the dataviz six-checks validator per mode. Money going
// out is amber in both charts; quoted revenue is blue, actually-collected cash
// is green.
const SERIES = {
  light: { revenue: "#2563eb", cost: "#b45309", collected: "#059669", paidOut: "#b45309" },
  dark: { revenue: "#3b82f6", cost: "#d97706", collected: "#10b981", paidOut: "#d97706" },
};

type ChartMode = "cash" | "quoted";

export function FinanceOverview({
  cases,
  quotedCases,
  planningCount,
  pays,
  period,
  displayCurrency,
  isAll,
  currency,
}: {
  cases: CaseFinance[];
  quotedCases: CaseFinance[];
  planningCount: number;
  pays: PaymentFinance[];
  period: Period;
  displayCurrency: string;
  isAll: boolean;
  currency: string;
}) {
  const { resolvedTheme } = useTheme();
  const colors = SERIES[resolvedTheme === "dark" ? "dark" : "light"];
  const [chartMode, setChartMode] = React.useState<ChartMode>("cash");
  const [page, setPage] = React.useState(0);

  const range = periodRange(period);
  const prev = previousRange(period);
  const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label.toLowerCase() ?? "";
  const deltaLabel = `vs previous ${period === "12m" ? "12 months" : periodLabel.replace(/^(this|last) /, "")}`;

  // Quoted metrics are scoped by case month; cash metrics by paid_at. The two
  // bases are never subtracted from each other (see finance-shared semantics).
  const totals = React.useMemo(() => {
    const sumQuoted = (r: { start: string; end: string } | null) => {
      let rev = 0,
        cost = 0;
      for (const c of quotedCases) {
        if (!inRange(c.month, r)) continue;
        rev += c.revenue;
        cost += c.cost;
      }
      return { rev, cost };
    };
    const sumCash = (r: { start: string; end: string } | null) => {
      let coll = 0,
        out = 0;
      for (const p of pays) {
        if (p.status !== "paid" || !inRange(p.paidAt, r)) continue;
        if (p.direction === "in") coll += p.amountCase;
        else out += p.amountCase;
      }
      return { coll, out };
    };
    // Outstanding is an as-of-today balance, deliberately not period-scoped.
    let balance = 0;
    for (const c of quotedCases) balance += c.revenue - c.collected;
    return { cur: { ...sumQuoted(range), ...sumCash(range) }, prevT: range ? { ...sumQuoted(prev), ...sumCash(prev) } : null, balance };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotedCases, pays, period]);

  const { cur, prevT, balance } = totals;
  const expectedMargin = cur.rev - cur.cost;
  const cashMargin = cur.coll - cur.out;

  const delta = (current: number, previous: number | undefined) =>
    prevT === null || previous === undefined
      ? undefined
      : { pct: deltaPct(current, previous), label: deltaLabel };

  // Both charts always show the trailing 12 months — the period filter answers
  // "how is this period going" via the cards; a one-month chart answers nothing.
  const chartData = React.useMemo(() => {
    const byMonth = new Map<string, { a: number; b: number }>();
    if (chartMode === "quoted") {
      for (const c of quotedCases) {
        const e = byMonth.get(c.month) ?? { a: 0, b: 0 };
        e.a += c.revenue;
        e.b += c.cost;
        byMonth.set(c.month, e);
      }
    } else {
      for (const p of pays) {
        if (p.status !== "paid" || !p.paidAt) continue;
        const m = p.paidAt.slice(0, 7);
        const e = byMonth.get(m) ?? { a: 0, b: 0 };
        if (p.direction === "in") e.a += p.amountCase;
        else e.b += p.amountCase;
        byMonth.set(m, e);
      }
    }
    const [keyA, keyB] = chartMode === "quoted" ? ["Revenue", "Cost"] : ["Collected", "Paid out"];
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, v]) => ({ month: monthLabel(month), [keyA]: v.a, [keyB]: v.b }));
  }, [quotedCases, pays, chartMode]);

  const chartSeries =
    chartMode === "quoted"
      ? [
          { key: "Revenue", color: colors.revenue },
          { key: "Cost", color: colors.cost },
        ]
      : [
          { key: "Collected", color: colors.collected },
          { key: "Paid out", color: colors.paidOut },
        ];

  React.useEffect(() => setPage(0), [currency]);
  const pageRows = React.useMemo(
    () => cases.slice(page * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE),
    [cases, page]
  );

  const scopeSuffix = isAll ? "all currencies → USD" : currency;

  return (
    <div className="space-y-4 pt-3">
      {/* 2-up on a phone: one-per-row pushed the chart and table four
          screen-heights down before anything else was visible. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Revenue (quoted)"
          value={cur.rev}
          displayCurrency={displayCurrency}
          sub={
            `Expected margin ${formatMoney(expectedMargin, displayCurrency)}` +
            (planningCount > 0 ? ` · excl. ${planningCount} planning` : "")
          }
          delta={delta(cur.rev, prevT?.rev)}
        />
        <Stat
          label="Collected"
          value={cur.coll}
          displayCurrency={displayCurrency}
          accent="text-success"
          sub={
            balance > 0.005
              ? `${formatMoney(balance, displayCurrency)} outstanding (all time)`
              : "Fully collected"
          }
          delta={delta(cur.coll, prevT?.coll)}
        />
        <Stat
          label="Paid out"
          value={cur.out}
          displayCurrency={displayCurrency}
          sub={`Quoted cost ${formatMoney(cur.cost, displayCurrency)}`}
          delta={delta(cur.out, prevT?.out)}
        />
        <Stat
          label="Cash margin"
          value={cashMargin}
          displayCurrency={displayCurrency}
          accent={cashMargin >= 0 ? "text-success" : "text-danger"}
          sub="Collected − paid out"
          delta={delta(cashMargin, prevT ? prevT.coll - prevT.out : undefined)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {chartMode === "cash" ? "Monthly cash flow" : "Monthly revenue vs. cost"} ({scopeSuffix})
          </CardTitle>
          <div
            role="group"
            aria-label="Chart basis"
            className="flex shrink-0 rounded-lg border border-border p-0.5"
          >
            {(["cash", "quoted"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={chartMode === m}
                onClick={() => setChartMode(m)}
                className={cn(
                  "pressable rounded-md px-2.5 py-1 text-xs font-medium capitalize cursor-pointer",
                  chartMode === m
                    ? "bg-primary-soft text-primary"
                    : "text-muted hover:text-foreground"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              {chartMode === "cash" ? "No paid payments" : "No quoted cases"}
              {isAll ? "" : ` in ${currency}`} yet.
            </p>
          ) : (
            <FinanceChart data={chartData} series={chartSeries} displayCurrency={displayCurrency} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-case margins ({scopeSuffix})</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table className="min-w-0 border-0 shadow-none sm:min-w-[34rem]">
            <THead>
              <tr>
                {/* Eight columns cannot coexist with a 390px screen —
                    Operation/Status/Paid out/Cost drop out below md/lg, leaving
                    the numbers the page exists to compare. */}
                <Th>Patient</Th>
                <Th className="hidden md:table-cell">Operation</Th>
                <Th className="hidden lg:table-cell">Status</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="text-right">Collected</Th>
                <Th className="hidden text-right lg:table-cell">Paid out</Th>
                <Th className="hidden text-right md:table-cell">Cost (quoted)</Th>
                <Th className="text-right">Margin</Th>
              </tr>
            </THead>
            <TBody>
              {cases.length === 0 && <EmptyRow colSpan={8} message="No cases in this currency." />}
              {pageRows.map((r) => {
                const actual = r.collected - r.paidOut;
                const expected = r.revenue - r.cost;
                const fullyPaid = r.collected >= r.revenue && r.revenue > 0;
                return (
                  <Tr key={r.id}>
                    <Td className="font-medium">
                      <Link href={`/patients/${r.patientId}`} className="hover:text-primary">
                        {r.patientName}
                      </Link>
                    </Td>
                    <Td className="hidden text-muted md:table-cell">{r.operation}</Td>
                    <Td className="hidden capitalize text-muted lg:table-cell">
                      {r.status.replace("_", " ")}
                    </Td>
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
                    <Td className="hidden text-right tabular-nums text-muted lg:table-cell">
                      {formatMoney(r.paidOut, displayCurrency)}
                    </Td>
                    <Td className="hidden text-right tabular-nums text-muted md:table-cell">
                      {formatMoney(r.cost, displayCurrency)}
                    </Td>
                    {/* Actual (cash) margin leads; the quoted expectation sits
                        under it so both fit one phone-surviving column. */}
                    <Td className="text-right">
                      <span
                        className={cn(
                          "block font-medium tabular-nums",
                          actual >= 0 ? "text-success" : "text-danger"
                        )}
                      >
                        {formatMoney(actual, displayCurrency)}
                      </span>
                      <span className="block text-xs tabular-nums text-muted-light">
                        exp. {formatMoney(expected, displayCurrency)}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
          <Pager page={page} setPage={setPage} total={cases.length} />
        </CardContent>
      </Card>
    </div>
  );
}
