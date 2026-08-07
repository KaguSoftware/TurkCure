"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { formatMoney, cn } from "@/lib/utils";
import {
  type CaseFinance,
  type PaymentFinance,
  type Period,
  periodRange,
  inRange,
  Pager,
  TABLE_PAGE_SIZE,
} from "./finance-shared";

type Dimension = "operation" | "hospital" | "doctor" | "source" | "country";

const DIMENSIONS: { value: Dimension; label: string; of: (c: CaseFinance) => string }[] = [
  { value: "operation", label: "Operation", of: (c) => c.operation },
  { value: "hospital", label: "Hospital", of: (c) => c.hospitalName },
  { value: "doctor", label: "Doctor", of: (c) => c.doctorName },
  { value: "source", label: "Source", of: (c) => c.source || "—" },
  { value: "country", label: "Country", of: (c) => c.country ?? "—" },
];

interface GroupRow {
  key: string;
  cases: number;
  revenue: number;
  cost: number;
  collected: number;
  paidOut: number;
}

/**
 * Which partners and procedures actually make money. Quoted columns group the
 * (planning-filtered) case rows by case month; cash columns group paid payment
 * rows by paid_at, mapped to their case's dimension — the two bases share a row
 * but are never subtracted from each other.
 */
export function FinanceBreakdowns({
  cases,
  quotedCases,
  pays,
  period,
  displayCurrency,
}: {
  cases: CaseFinance[];
  quotedCases: CaseFinance[];
  pays: PaymentFinance[];
  period: Period;
  displayCurrency: string;
}) {
  const [dimension, setDimension] = React.useState<Dimension>("operation");
  const [page, setPage] = React.useState(0);

  const dim = DIMENSIONS.find((d) => d.value === dimension)!;

  const groups = React.useMemo(() => {
    const range = periodRange(period);
    const byKey = new Map<string, GroupRow>();
    const group = (key: string) => {
      const g = byKey.get(key) ?? { key, cases: 0, revenue: 0, cost: 0, collected: 0, paidOut: 0 };
      byKey.set(key, g);
      return g;
    };

    for (const c of quotedCases) {
      if (!inRange(c.month, range)) continue;
      const g = group(dim.of(c));
      g.cases += 1;
      g.revenue += c.revenue;
      g.cost += c.cost;
    }

    // Cash includes every case regardless of status — real money is real. The
    // dimension is looked up on the full case list, so a payment on a planning
    // case still lands in its group's cash columns.
    const dimByCase = new Map(cases.map((c) => [c.id, dim.of(c)]));
    for (const p of pays) {
      if (p.status !== "paid" || !inRange(p.paidAt, range)) continue;
      const key = dimByCase.get(p.caseId);
      if (key === undefined) continue; // cancelled or out-of-currency case
      const g = group(key);
      if (p.direction === "in") g.collected += p.amountCase;
      else g.paidOut += p.amountCase;
    }

    return [...byKey.values()].sort((a, b) => b.revenue - a.revenue);
  }, [cases, quotedCases, pays, period, dim]);

  React.useEffect(() => setPage(0), [dimension, period]);
  const pageRows = groups.slice(page * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE);

  return (
    <div className="space-y-4 pt-3">
      <Card>
        <CardHeader>
          <CardTitle>By {dim.label.toLowerCase()}</CardTitle>
          <div className="w-36">
            <Select
              value={dimension}
              onChange={(e) => setDimension(e.target.value as Dimension)}
              aria-label="Breakdown dimension"
            >
              {DIMENSIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table className="min-w-0 border-0 shadow-none sm:min-w-[34rem]">
            <THead>
              <tr>
                <Th>{dim.label}</Th>
                <Th className="hidden text-right sm:table-cell">Cases</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="hidden text-right sm:table-cell">Collected</Th>
                <Th className="hidden text-right md:table-cell">Paid out</Th>
                <Th className="hidden text-right lg:table-cell">Expected margin</Th>
                <Th className="text-right">Actual margin</Th>
              </tr>
            </THead>
            <TBody>
              {groups.length === 0 && (
                <EmptyRow colSpan={7} message="Nothing in this period yet." />
              )}
              {pageRows.map((g) => {
                const expected = g.revenue - g.cost;
                const actual = g.collected - g.paidOut;
                return (
                  <Tr key={g.key}>
                    <Td className="font-medium">{g.key}</Td>
                    <Td className="hidden text-right tabular-nums text-muted sm:table-cell">
                      {g.cases}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(g.revenue, displayCurrency)}
                    </Td>
                    <Td className="hidden text-right tabular-nums text-muted sm:table-cell">
                      {formatMoney(g.collected, displayCurrency)}
                    </Td>
                    <Td className="hidden text-right tabular-nums text-muted md:table-cell">
                      {formatMoney(g.paidOut, displayCurrency)}
                    </Td>
                    <Td
                      className={cn(
                        "hidden text-right tabular-nums lg:table-cell",
                        expected >= 0 ? "text-muted" : "text-danger"
                      )}
                    >
                      {formatMoney(expected, displayCurrency)}
                    </Td>
                    <Td
                      className={cn(
                        "text-right font-medium tabular-nums",
                        actual >= 0 ? "text-success" : "text-danger"
                      )}
                    >
                      {formatMoney(actual, displayCurrency)}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
          <Pager page={page} setPage={setPage} total={groups.length} />
        </CardContent>
      </Card>
    </div>
  );
}
