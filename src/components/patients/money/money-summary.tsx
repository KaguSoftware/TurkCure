"use client";

import * as React from "react";
import { formatMoney } from "@/lib/utils";
import type { CaseAdditionalCost, Payment, QuoteItem } from "@/lib/types";

/**
 * The whole money story of a case in one row of cards: what was quoted, what
 * landed, what's still owed — and for admins, what it costs us. Derived from
 * the same optimistic lists the tables below edit, so an in-flight change is
 * reflected here immediately.
 */
export function MoneySummary({
  currency,
  quoteItems,
  additionalCosts,
  payments,
  isAdmin,
}: {
  currency: string;
  quoteItems: QuoteItem[];
  additionalCosts: CaseAdditionalCost[];
  payments: Payment[];
  isAdmin: boolean;
}) {
  const totals = React.useMemo(() => {
    const quoted = quoteItems.reduce((s, i) => s + Number(i.price), 0);
    const cost = quoteItems.reduce((s, i) => s + Number(i.cost ?? 0), 0);
    // Same basis as the PDF's "Deposit paid": incoming, actually paid,
    // normalized to the case currency at each row's frozen rate.
    const paid = payments
      .filter((p) => p.direction === "in" && p.paid_at)
      .reduce((s, p) => s + Number(p.amount_case ?? p.amount), 0);
    const extras = additionalCosts.reduce((s, c) => s + Number(c.amount), 0);
    return { quoted, cost, paid, extras, outstanding: quoted - paid };
  }, [quoteItems, additionalCosts, payments]);

  const stat = (label: string, value: string, tone?: string, sub?: React.ReactNode) => (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={"mt-1 text-xl font-bold tabular-nums " + (tone ?? "")}>{value}</p>
      {sub}
    </div>
  );

  const margin = totals.quoted - totals.cost;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stat(
        "Quoted total",
        formatMoney(totals.quoted, currency),
        undefined,
        // Margin rides along under the quoted figure instead of owning a fifth
        // card — it's derived from the same two numbers the table already shows.
        isAdmin ? (
          <p className="mt-0.5 text-xs text-muted-light">
            Cost {formatMoney(totals.cost, currency)} ·{" "}
            <span className={margin >= 0 ? "text-success" : "text-danger"}>
              {formatMoney(margin, currency)} margin
            </span>
          </p>
        ) : null
      )}
      {stat("Paid by patient", formatMoney(totals.paid, currency), "text-success")}
      {stat(
        "Outstanding",
        formatMoney(Math.max(totals.outstanding, 0), currency),
        totals.outstanding <= 0 ? "text-success" : "text-warning",
        totals.outstanding < 0 ? (
          <p className="mt-0.5 text-xs text-success">
            Overpaid by {formatMoney(-totals.outstanding, currency)}
          </p>
        ) : totals.outstanding === 0 && totals.quoted > 0 ? (
          <p className="mt-0.5 text-xs text-success">Paid in full</p>
        ) : null
      )}
      {/* Dashed on purpose: extras sit beside the package, never inside it. */}
      <div className="rounded-xl border border-dashed border-border-strong bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Additional costs</p>
        <p className="mt-1 text-xl font-bold tabular-nums">
          {formatMoney(totals.extras, currency)}
        </p>
        <p className="mt-0.5 text-xs text-muted-light">Billed separately — not in the total</p>
      </div>
    </div>
  );
}
