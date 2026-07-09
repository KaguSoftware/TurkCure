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
}

// Palette validated with the dataviz six-checks validator per mode
const SERIES = {
  light: { revenue: "#2563eb", cost: "#b45309" },
  dark: { revenue: "#3b82f6", cost: "#d97706" },
};

export function FinanceView({ rows }: { rows: CaseFinance[] }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const [currency, setCurrency] = React.useState("EUR");

  const colors = SERIES[resolvedTheme === "dark" ? "dark" : "light"];
  const filtered = rows.filter((r) => r.currency === currency);

  const totalRevenue = filtered.reduce((s, r) => s + r.revenue, 0);
  const totalCost = filtered.reduce((s, r) => s + r.cost, 0);
  const margin = totalRevenue - totalCost;

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

  const stat = (label: string, value: number, accent?: string) => (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold tabular-nums", accent)}>
          {formatMoney(value, currency)}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          {stat("Revenue (quoted)", totalRevenue)}
          {stat("Internal cost", totalCost)}
          {stat("Margin", margin, margin >= 0 ? "text-success" : "text-danger")}
        </div>
        <div className="ml-4 w-28">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly revenue vs. cost ({currency})</CardTitle>
        </CardHeader>
        <CardContent>
          {!mounted || chartData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              No quoted cases in {currency} yet.
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
                    formatter={(value) => formatMoney(Number(value), currency)}
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
          <CardTitle>Per-case margins ({currency})</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table className="border-0 shadow-none">
            <THead>
              <tr>
                <Th>Patient</Th>
                <Th>Operation</Th>
                <Th>Status</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Margin</Th>
              </tr>
            </THead>
            <TBody>
              {filtered.length === 0 && <EmptyRow colSpan={6} message="No cases in this currency." />}
              {filtered.map((r) => {
                const m = r.revenue - r.cost;
                return (
                  <Tr key={r.id}>
                    <Td className="font-medium">
                      <Link href={`/patients/${r.patientId}`} className="hover:text-primary">
                        {r.patientName}
                      </Link>
                    </Td>
                    <Td className="text-muted">{r.operation}</Td>
                    <Td className="capitalize text-muted">{r.status.replace("_", " ")}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(r.revenue, r.currency)}</Td>
                    <Td className="text-right tabular-nums text-muted">
                      {formatMoney(r.cost, r.currency)}
                    </Td>
                    <Td
                      className={cn(
                        "text-right font-medium tabular-nums",
                        m >= 0 ? "text-success" : "text-danger"
                      )}
                    >
                      {formatMoney(m, r.currency)}
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
