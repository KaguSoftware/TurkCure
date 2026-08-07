"use client";

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
import { formatMoney } from "@/lib/utils";

export type FinanceChartDatum = { month: string } & Record<string, string | number>;

// recharts is heavy; this component is loaded via next/dynamic so it stays out
// of the finance page's eager bundle. Series are data-driven so the same chart
// serves both the quoted (Revenue/Cost) and cash (Collected/Paid out) views.
export default function FinanceChart({
  data,
  series,
  displayCurrency,
}: {
  data: FinanceChartDatum[];
  series: { key: string; color: string }[];
  displayCurrency: string;
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2}>
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
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
