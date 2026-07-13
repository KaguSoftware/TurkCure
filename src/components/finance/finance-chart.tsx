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

export interface FinanceChartDatum {
  month: string;
  Revenue: number;
  Cost: number;
}

// recharts is heavy; this component is loaded via next/dynamic so it stays out
// of the finance page's eager bundle.
export default function FinanceChart({
  data,
  colors,
  displayCurrency,
}: {
  data: FinanceChartDatum[];
  colors: { revenue: string; cost: string };
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
          <Bar dataKey="Revenue" fill={colors.revenue} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="Cost" fill={colors.cost} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
