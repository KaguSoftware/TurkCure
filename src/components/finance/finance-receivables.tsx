"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { formatMoney, formatDate, cn } from "@/lib/utils";
import {
  type CaseFinance,
  type PaymentFinance,
  Pager,
  TABLE_PAGE_SIZE,
} from "./finance-shared";

/** Compact in-card stat: the balances belong to their table, not to floating cards. */
function MiniStat({
  label,
  value,
  displayCurrency,
  accent,
  sub,
}: {
  label: string;
  value: number;
  displayCurrency: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums", accent)}>
        {formatMoney(value, displayCurrency)}
      </p>
      {sub && <p className="mt-0.5 hidden text-xs text-muted-light sm:block">{sub}</p>}
    </div>
  );
}

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * As-of-today balances — deliberately not period-scoped (a balance is not a
 * flow). Receivables come off the quoted case set, so the planning toggle
 * applies: nothing is "owed" on a case that hasn't been agreed.
 */
export function FinanceReceivables({
  quotedCases,
  pays,
  displayCurrency,
}: {
  quotedCases: CaseFinance[];
  pays: PaymentFinance[];
  displayCurrency: string;
}) {
  const [recvPage, setRecvPage] = React.useState(0);
  const [payPage, setPayPage] = React.useState(0);

  const today = isoDatePlusDays(0);
  const soon = isoDatePlusDays(7);

  const {
    receivableRows,
    totalOutstanding,
    overdueIn,
    dueSoonIn,
    payableGroups,
    totalPayable,
    overdueOut,
  } = React.useMemo(() => {
    const open = pays.filter((p) => p.status !== "paid");

    // Open incoming payments per case drive the due/overdue badge; the amount
    // owed itself is the quoted-vs-collected balance, which stays meaningful
    // even when no payment schedule was ever entered.
    const openInByCase = new Map<string, PaymentFinance[]>();
    let overdueInSum = 0;
    let dueSoonInSum = 0;
    for (const p of open) {
      if (p.direction !== "in") continue;
      const list = openInByCase.get(p.caseId) ?? [];
      list.push(p);
      openInByCase.set(p.caseId, list);
      if (p.dueDate) {
        if (p.dueDate < today) overdueInSum += p.amountCase;
        else if (p.dueDate <= soon) dueSoonInSum += p.amountCase;
      }
    }

    let outstandingSum = 0;
    const rrows = quotedCases
      .map((c) => {
        const outstanding = c.revenue - c.collected;
        const openIn = openInByCase.get(c.id) ?? [];
        const dues = openIn.map((p) => p.dueDate).filter((d): d is string => d !== null).sort();
        const overdue = dues.length > 0 && dues[0] < today;
        return { ...c, outstanding, nextDue: dues[0] ?? null, overdue };
      })
      .filter((c) => c.outstanding > 0.005)
      .sort((a, b) => b.outstanding - a.outstanding);
    for (const r of rrows) outstandingSum += r.outstanding;

    // Payables group by who is owed, across cases. Cross-currency totals are
    // only meaningful normalized, so this table always shows the display
    // currency; drill into the patient for the original amounts.
    const groups = new Map<
      string,
      { type: string; name: string; count: number; earliestDue: string | null; total: number; overdue: boolean }
    >();
    let payableSum = 0;
    let overdueOutSum = 0;
    for (const p of open) {
      if (p.direction !== "out") continue;
      payableSum += p.amountCase;
      const isOverdue = p.dueDate !== null && p.dueDate < today;
      if (isOverdue) overdueOutSum += p.amountCase;
      const key = `${p.counterpartyType}|${p.counterpartyName}`;
      const g = groups.get(key) ?? {
        type: p.counterpartyType,
        name: p.counterpartyName,
        count: 0,
        earliestDue: null,
        total: 0,
        overdue: false,
      };
      g.count += 1;
      g.total += p.amountCase;
      g.overdue ||= isOverdue;
      if (p.dueDate && (g.earliestDue === null || p.dueDate < g.earliestDue)) g.earliestDue = p.dueDate;
      groups.set(key, g);
    }
    const pgroups = [...groups.values()].sort((a, b) => b.total - a.total);

    return {
      receivableRows: rrows,
      totalOutstanding: outstandingSum,
      overdueIn: overdueInSum,
      dueSoonIn: dueSoonInSum,
      payableGroups: pgroups,
      totalPayable: payableSum,
      overdueOut: overdueOutSum,
    };
  }, [quotedCases, pays, today, soon]);

  const recvRows = receivableRows.slice(
    recvPage * TABLE_PAGE_SIZE,
    recvPage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE
  );
  const payRows = payableGroups.slice(
    payPage * TABLE_PAGE_SIZE,
    payPage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE
  );

  return (
    <div className="space-y-4 pt-3">
      <p className="text-xs text-muted-light">
        Balances as of today — the period filter does not apply here.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Receivables — who owes us</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="grid grid-cols-3 gap-3 border-b border-border px-5 pb-4 pt-1">
            <MiniStat
              label="Outstanding"
              value={totalOutstanding}
              displayCurrency={displayCurrency}
              sub="Quoted − collected, open cases"
            />
            <MiniStat
              label="Overdue"
              value={overdueIn}
              displayCurrency={displayCurrency}
              accent={overdueIn > 0 ? "text-danger" : undefined}
              sub="Scheduled incoming past due"
            />
            <MiniStat
              label="Due ≤ 7 days"
              value={dueSoonIn}
              displayCurrency={displayCurrency}
              sub="Scheduled incoming this week"
            />
          </div>
          <Table className="min-w-0 border-0 shadow-none sm:min-w-[34rem]">
            <THead>
              <tr>
                <Th>Patient</Th>
                <Th className="hidden md:table-cell">Operation</Th>
                <Th className="hidden text-right md:table-cell">Revenue</Th>
                <Th className="hidden text-right sm:table-cell">Collected</Th>
                <Th className="text-right">Outstanding</Th>
                <Th className="text-right">Due</Th>
              </tr>
            </THead>
            <TBody>
              {receivableRows.length === 0 && (
                <EmptyRow colSpan={6} message="Nothing outstanding — everything quoted is collected." />
              )}
              {recvRows.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">
                    <Link href={`/patients/${r.patientId}`} className="hover:text-primary">
                      {r.patientName}
                    </Link>
                  </Td>
                  <Td className="hidden text-muted md:table-cell">{r.operation}</Td>
                  <Td className="hidden text-right tabular-nums text-muted md:table-cell">
                    {formatMoney(r.revenue, displayCurrency)}
                  </Td>
                  <Td className="hidden text-right tabular-nums text-muted sm:table-cell">
                    {formatMoney(r.collected, displayCurrency)}
                  </Td>
                  <Td className="text-right font-medium tabular-nums">
                    {formatMoney(r.outstanding, displayCurrency)}
                  </Td>
                  <Td className="text-right">
                    {r.overdue ? (
                      <Badge tone="red">Overdue</Badge>
                    ) : r.nextDue ? (
                      <Badge tone="amber">{formatDate(r.nextDue)}</Badge>
                    ) : (
                      <Badge>Unscheduled</Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pager page={recvPage} setPage={setRecvPage} total={receivableRows.length} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payables — who we owe</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="grid grid-cols-3 gap-3 border-b border-border px-5 pb-4 pt-1">
            <MiniStat
              label="Total payable"
              value={totalPayable}
              displayCurrency={displayCurrency}
              sub="Open payouts to providers"
            />
            <MiniStat
              label="Overdue"
              value={overdueOut}
              displayCurrency={displayCurrency}
              accent={overdueOut > 0 ? "text-danger" : undefined}
              sub="Scheduled outgoing past due"
            />
          </div>
          <Table className="min-w-0 border-0 shadow-none sm:min-w-[30rem]">
            <THead>
              <tr>
                <Th>Counterparty</Th>
                <Th className="hidden md:table-cell">Type</Th>
                <Th className="hidden text-right sm:table-cell">Payments</Th>
                <Th className="text-right">Earliest due</Th>
                <Th className="text-right">Total due</Th>
              </tr>
            </THead>
            <TBody>
              {payableGroups.length === 0 && (
                <EmptyRow colSpan={5} message="No open payouts to providers." />
              )}
              {payRows.map((g) => (
                <Tr key={`${g.type}|${g.name}`}>
                  <Td className="font-medium">{g.name}</Td>
                  <Td className="hidden capitalize text-muted md:table-cell">{g.type}</Td>
                  <Td className="hidden text-right tabular-nums text-muted sm:table-cell">{g.count}</Td>
                  <Td className={cn("text-right", g.overdue ? "text-danger" : "text-muted")}>
                    {g.earliestDue ? formatDate(g.earliestDue) : "—"}
                  </Td>
                  <Td className="text-right font-medium tabular-nums">
                    {formatMoney(g.total, displayCurrency)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pager page={payPage} setPage={setPayPage} total={payableGroups.length} />
        </CardContent>
      </Card>
    </div>
  );
}
