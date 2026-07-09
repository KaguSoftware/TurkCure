"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { CURRENCIES, formatMoney, cn } from "@/lib/utils";
import { toUsd, FX_RATES_AS_OF } from "@/lib/fx";

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
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [currency, setCurrency] = React.useState("ALL");

  const colors = SERIES[resolvedTheme === "dark" ? "dark" : "light"];
  const isAll = currency === "ALL";
  const displayCurrency = isAll ? "USD" : currency;
  // In "All" mode every case is converted to USD; otherwise filter to one currency
  const filtered = isAll
    ? rows.map((r) => ({
        ...r,
        revenue: toUsd(r.revenue, r.currency),
        cost: toUsd(r.cost, r.currency),
        collected: toUsd(r.collected, r.currency),
      }))
    : rows.filter((r) => r.currency === currency);

  const totalRevenue = filtered.reduce((s, r) => s + r.revenue, 0);
  const totalCost = filtered.reduce((s, r) => s + r.cost, 0);
  const totalCollected = filtered.reduce((s, r) => s + r.collected, 0);
  const margin = totalRevenue - totalCost;
  const outstanding = totalRevenue - totalCollected;

  const byMonth = new Map<string, { revenue: number; cost: number }>();
  for (const r of filtered) {
    const entry = byMonth.get(r.month) ?? { revenue: 0, cost: 0 };
    entry.revenue += r.revenue;
    entry.cost += r.cost;
    byMonth.set(r.month, entry);
  }
  const chartData = [...byMonth.entries()]
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
      <div className="flex items-start justify-between">
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
        <div className="ml-4 w-36 shrink-0">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="ALL">All (in USD)</option>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          {isAll && (
            <p className="mt-1.5 text-right text-[10px] leading-tight text-muted-light">
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
          {!mounted || chartData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              No quoted cases {isAll ? "" : `in ${currency} `}yet.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value) => formatMoney(Number(value), displayCurrency)}
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--foreground)",
                      fontSize: 12,
                    }}
                    cursor={{ fill: "var(--surface-hover)" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: "var(--muted)" }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Bar dataKey="Revenue" fill={colors.revenue} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Cost" fill={colors.cost} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
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
              {filtered.map((r) => {
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
        </CardContent>
      </Card>
    </div>
  );
}
