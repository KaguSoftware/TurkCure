"use client";

/**
 * React NodeViews for the structured document blocks.
 *
 * The pattern throughout is "form-in-the-document": each block renders as it
 * will print, and every editable value is a borderless input that reads as
 * document text until focused. Staff edit the document, not a form beside it.
 *
 * Every view honours `editor.isEditable` so a finalized document is read-only.
 */

import * as React from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Borderless input that looks like document text until focused. */
function GhostInput({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full rounded bg-transparent px-1 -mx-1 outline-none",
        // Literal focus colours — see the note in editor.css. A theme token here
        // paints dark-on-dark in dark mode.
        "focus:bg-[var(--doc-focus)] focus:ring-1 focus:ring-[var(--doc-focus-ring)]/40",
        "placeholder:text-[var(--doc-muted-light)] disabled:cursor-default",
        className
      )}
    />
  );
}

/** Small icon button used for add/remove row controls. */
function RowButton({
  onClick,
  label,
  children,
  disabled,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  if (disabled) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      contentEditable={false}
      className="pressable rounded p-1 text-[var(--doc-muted)] hover:bg-[var(--doc-hover-bg)] hover:text-[var(--doc-ink)] cursor-pointer"
    >
      {children}
    </button>
  );
}

/** The navy section band, mirroring `TableSection`'s header in the PDF. */
function SectionBand({
  number,
  title,
  onNumber,
  onTitle,
  editable,
}: {
  number: string;
  title: string;
  onNumber: (v: string) => void;
  onTitle: (v: string) => void;
  editable: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-t bg-[var(--doc-navy)] px-3.5 py-2 text-white">
      <span className="h-px w-3.5 shrink-0 bg-[var(--doc-gold)]" />
      <GhostInput
        value={number}
        onChange={onNumber}
        disabled={!editable}
        aria-label="Section number"
        className="w-8 shrink-0 font-serif text-[11px] font-bold text-white focus:bg-[var(--doc-focus-dark)] focus:ring-1 focus:ring-white/50"
      />
      <GhostInput
        value={title}
        onChange={onTitle}
        disabled={!editable}
        aria-label="Section title"
        className="font-serif text-[11px] font-bold tracking-wide text-white focus:bg-[var(--doc-focus-dark)] focus:ring-1 focus:ring-white/50"
      />
    </div>
  );
}

interface Row {
  label: string;
  value: string;
}

/** Editable label/value rows shared by the table-style sections. */
function RowList({
  rows,
  onChange,
  editable,
  valueLabel = "Value",
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  editable: boolean;
  valueLabel?: string;
}) {
  const patch = (i: number, key: keyof Row, v: string) =>
    onChange(rows.map((r, j) => (i === j ? { ...r, [key]: v } : r)));
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="flex items-stretch border-t border-[var(--doc-line)] first:border-t-0">
          <div className="w-2/5 bg-[var(--doc-tint)] px-3.5 py-2">
            <GhostInput
              value={r.label}
              onChange={(v) => patch(i, "label", v)}
              disabled={!editable}
              aria-label="Row label"
              className="text-[9px] font-semibold uppercase tracking-wider text-[var(--doc-muted)]"
            />
          </div>
          <div className="flex flex-1 items-center gap-1 px-3.5 py-2">
            <GhostInput
              value={r.value}
              onChange={(v) => patch(i, "value", v)}
              disabled={!editable}
              aria-label={valueLabel}
              className="text-[11px] font-medium"
            />
            <RowButton
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              label="Remove row"
              disabled={!editable}
            >
              <Trash2 className="size-3.5" />
            </RowButton>
          </div>
        </div>
      ))}
      {editable && (
        <button
          type="button"
          contentEditable={false}
          onClick={() => onChange([...rows, { label: "", value: "" }])}
          className="pressable flex w-full items-center gap-1.5 border-t border-dashed border-[var(--doc-line)] px-3.5 py-1.5 text-[10px] text-[var(--doc-muted)] hover:text-[var(--doc-ink)] cursor-pointer"
        >
          <Plus className="size-3" /> Add row
        </button>
      )}
    </>
  );
}

/** Card shell matching the PDF's hairline-bordered section body. */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-b border border-t-0 border-[var(--doc-line)] bg-white">
      {children}
    </div>
  );
}

function Block({ children, selected }: { children: React.ReactNode; selected?: boolean }) {
  return (
    <NodeViewWrapper
      className={cn(
        "doc-block mb-5",
        selected && "rounded ring-2 ring-[var(--doc-focus-ring)]/40"
      )}
    >
      {children}
    </NodeViewWrapper>
  );
}

// ── Views ───────────────────────────────────────────────────────────────────

export function CoverBlockView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const a = node.attrs as Record<string, string | string[]>;
  const editable = editor.isEditable;
  const treatments = (a.treatments as string[]) ?? [];
  const set = (k: string) => (v: string) => updateAttributes({ [k]: v });
  return (
    <Block selected={selected}>
      <div className="rounded border border-[var(--doc-gold)] bg-[var(--doc-navy)] px-8 py-7 text-center">
        <p className="mb-4 text-[8px] uppercase tracking-[0.3em] text-[var(--doc-gold-light)]">
          Cover page
        </p>
        <GhostInput
          value={String(a.title ?? "")}
          onChange={set("title")}
          disabled={!editable}
          aria-label="Cover title"
          className="text-center font-serif text-xl font-bold text-white focus:bg-[var(--doc-focus-dark)] focus:ring-1 focus:ring-white/50"
        />
        <GhostInput
          value={String(a.titleAccent ?? "")}
          onChange={set("titleAccent")}
          disabled={!editable}
          aria-label="Cover title accent"
          className="text-center font-serif text-xl font-bold text-[var(--doc-gold)] focus:bg-[var(--doc-focus-dark)] focus:ring-1 focus:ring-white/50"
        />
        <p className="mt-5 text-[8px] uppercase tracking-[0.25em] text-[var(--doc-gold)]">
          {String(a.preparedForLabel ?? "Prepared for")}
        </p>
        <GhostInput
          value={String(a.patientName ?? "")}
          onChange={set("patientName")}
          disabled={!editable}
          aria-label="Patient name"
          className="mt-1 text-center font-serif text-lg font-bold text-white focus:bg-[var(--doc-focus-dark)] focus:ring-1 focus:ring-white/50"
        />
        <div className="mt-3 space-y-1">
          {treatments.map((t, i) => (
            <div key={i} className="flex items-center justify-center gap-1">
              <GhostInput
                value={t}
                onChange={(v) =>
                  updateAttributes({ treatments: treatments.map((x, j) => (i === j ? v : x)) })
                }
                disabled={!editable}
                aria-label="Treatment"
                className="text-center font-serif text-[11px] italic text-[var(--doc-gold-light)] focus:bg-[var(--doc-focus-dark)] focus:ring-1 focus:ring-white/50"
              />
              <RowButton
                onClick={() =>
                  updateAttributes({ treatments: treatments.filter((_, j) => j !== i) })
                }
                label="Remove treatment"
                disabled={!editable}
              >
                <Trash2 className="size-3 text-[var(--doc-gold-light)]" />
              </RowButton>
            </div>
          ))}
          {editable && (
            <button
              type="button"
              contentEditable={false}
              onClick={() => updateAttributes({ treatments: [...treatments, ""] })}
              className="pressable text-[9px] text-[var(--doc-gold-light)] hover:text-white cursor-pointer"
            >
              + Add treatment
            </button>
          )}
        </div>
        <div className="mt-5 space-y-1">
          <GhostInput
            value={String(a.line1 ?? "")}
            onChange={set("line1")}
            disabled={!editable}
            placeholder="Doctor · Hospital"
            aria-label="Cover line 1"
            className="text-center text-[9px] text-[#e8ecf5] focus:bg-[var(--doc-focus-dark)] focus:ring-1 focus:ring-white/50"
          />
          <GhostInput
            value={String(a.line2 ?? "")}
            onChange={set("line2")}
            disabled={!editable}
            placeholder="Arrival — Departure"
            aria-label="Cover line 2"
            className="text-center text-[9px] text-[var(--doc-gold-light)] focus:bg-[var(--doc-focus-dark)] focus:ring-1 focus:ring-white/50"
          />
          <GhostInput
            value={String(a.footer ?? "")}
            onChange={set("footer")}
            disabled={!editable}
            aria-label="Cover footer"
            className="text-center text-[8px] tracking-wider text-[var(--doc-gold-light)] focus:bg-[var(--doc-focus-dark)] focus:ring-1 focus:ring-white/50"
          />
        </div>
      </div>
    </Block>
  );
}

export function TableSectionView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const a = node.attrs as { number: string; title: string; rows: Row[] };
  const editable = editor.isEditable;
  return (
    <Block selected={selected}>
      <SectionBand
        number={String(a.number ?? "")}
        title={String(a.title ?? "")}
        onNumber={(v) => updateAttributes({ number: v })}
        onTitle={(v) => updateAttributes({ title: v })}
        editable={editable}
      />
      <Card>
        <RowList
          rows={a.rows ?? []}
          onChange={(rows) => updateAttributes({ rows })}
          editable={editable}
        />
      </Card>
    </Block>
  );
}

export function PackageBulletsView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const a = node.attrs as { number: string; title: string; procedure: string; bullets: string[] };
  const editable = editor.isEditable;
  const bullets = a.bullets ?? [];
  return (
    <Block selected={selected}>
      <SectionBand
        number={String(a.number ?? "")}
        title={String(a.title ?? "")}
        onNumber={(v) => updateAttributes({ number: v })}
        onTitle={(v) => updateAttributes({ title: v })}
        editable={editable}
      />
      <Card>
        <div className="px-3.5 py-3">
          <div className="mb-2 flex items-baseline gap-1 text-[10.5px] font-bold">
            <span className="shrink-0">Procedure:</span>
            <GhostInput
              value={String(a.procedure ?? "")}
              onChange={(v) => updateAttributes({ procedure: v })}
              disabled={!editable}
              aria-label="Procedure"
              className="font-bold"
            />
          </div>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {bullets.map((b, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-[var(--doc-gold)]">•</span>
                <GhostInput
                  value={b}
                  onChange={(v) =>
                    updateAttributes({ bullets: bullets.map((x, j) => (i === j ? v : x)) })
                  }
                  disabled={!editable}
                  aria-label="Package item"
                  className="text-[11px]"
                />
                <RowButton
                  onClick={() => updateAttributes({ bullets: bullets.filter((_, j) => j !== i) })}
                  label="Remove item"
                  disabled={!editable}
                >
                  <Trash2 className="size-3" />
                </RowButton>
              </div>
            ))}
          </div>
          {editable && (
            <button
              type="button"
              contentEditable={false}
              onClick={() => updateAttributes({ bullets: [...bullets, ""] })}
              className="pressable mt-2 flex items-center gap-1.5 text-[10px] text-[var(--doc-muted)] hover:text-[var(--doc-ink)] cursor-pointer"
            >
              <Plus className="size-3" /> Add item
            </button>
          )}
        </div>
      </Card>
    </Block>
  );
}

export function PaymentSummaryView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const a = node.attrs as {
    number: string;
    title: string;
    rows: Row[];
    balanceLabel: string;
    balanceValue: string;
    note: string;
  };
  const editable = editor.isEditable;
  return (
    <Block selected={selected}>
      <SectionBand
        number={String(a.number ?? "")}
        title={String(a.title ?? "")}
        onNumber={(v) => updateAttributes({ number: v })}
        onTitle={(v) => updateAttributes({ title: v })}
        editable={editable}
      />
      <Card>
        <RowList
          rows={a.rows ?? []}
          onChange={(rows) => updateAttributes({ rows })}
          editable={editable}
        />
        <div className="flex items-stretch border-t border-[var(--doc-line)] bg-[var(--doc-gold-soft)]">
          <div className="w-2/5 px-3.5 py-2">
            <GhostInput
              value={String(a.balanceLabel ?? "")}
              onChange={(v) => updateAttributes({ balanceLabel: v })}
              disabled={!editable}
              aria-label="Balance label"
              className="text-[9px] font-semibold uppercase tracking-wider text-[var(--doc-gold-dark)]"
            />
          </div>
          <div className="flex-1 px-3.5 py-2">
            <GhostInput
              value={String(a.balanceValue ?? "")}
              onChange={(v) => updateAttributes({ balanceValue: v })}
              disabled={!editable}
              aria-label="Balance value"
              className="text-[12px] font-bold text-[var(--doc-navy)]"
            />
          </div>
        </div>
      </Card>
      <GhostInput
        value={String(a.note ?? "")}
        onChange={(v) => updateAttributes({ note: v })}
        disabled={!editable}
        aria-label="Payment note"
        className="mt-1.5 text-[8.5px] text-[var(--doc-muted)]"
      />
    </Block>
  );
}

export function AdditionalCostsView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const a = node.attrs as {
    number: string;
    title: string;
    rows: { title: string; amount: string }[];
    note: string;
  };
  const editable = editor.isEditable;
  const rows = a.rows ?? [];
  const patch = (i: number, key: "title" | "amount", v: string) =>
    updateAttributes({ rows: rows.map((r, j) => (i === j ? { ...r, [key]: v } : r)) });
  return (
    <Block selected={selected}>
      <SectionBand
        number={String(a.number ?? "")}
        title={String(a.title ?? "")}
        onNumber={(v) => updateAttributes({ number: v })}
        onTitle={(v) => updateAttributes({ title: v })}
        editable={editable}
      />
      <Card>
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-stretch border-t border-[var(--doc-line)] first:border-t-0"
          >
            <div className="w-2/5 bg-[var(--doc-tint)] px-3.5 py-2">
              <GhostInput
                value={r.title}
                onChange={(v) => patch(i, "title", v)}
                disabled={!editable}
                aria-label="Cost title"
                className="text-[9px] font-semibold uppercase tracking-wider text-[var(--doc-muted)]"
              />
            </div>
            <div className="flex flex-1 items-center gap-1 px-3.5 py-2">
              <GhostInput
                value={r.amount}
                onChange={(v) => patch(i, "amount", v)}
                disabled={!editable}
                aria-label="Cost amount"
                className="text-[11px] font-medium"
              />
              <RowButton
                onClick={() => updateAttributes({ rows: rows.filter((_, j) => j !== i) })}
                label="Remove cost"
                disabled={!editable}
              >
                <Trash2 className="size-3.5" />
              </RowButton>
            </div>
          </div>
        ))}
        {editable && (
          <button
            type="button"
            contentEditable={false}
            onClick={() => updateAttributes({ rows: [...rows, { title: "", amount: "" }] })}
            className="pressable flex w-full items-center gap-1.5 border-t border-dashed border-[var(--doc-line)] px-3.5 py-1.5 text-[10px] text-[var(--doc-muted)] hover:text-[var(--doc-ink)] cursor-pointer"
          >
            <Plus className="size-3" /> Add cost
          </button>
        )}
      </Card>
      <GhostInput
        value={String(a.note ?? "")}
        onChange={(v) => updateAttributes({ note: v })}
        disabled={!editable}
        aria-label="Additional costs note"
        className="mt-1.5 text-[8.5px] text-[var(--doc-muted)]"
      />
    </Block>
  );
}

export function CompanyCardView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const a = node.attrs as { number: string; title: string; rows: Row[] };
  const editable = editor.isEditable;
  return (
    <Block selected={selected}>
      <SectionBand
        number={String(a.number ?? "")}
        title={String(a.title ?? "")}
        onNumber={(v) => updateAttributes({ number: v })}
        onTitle={(v) => updateAttributes({ title: v })}
        editable={editable}
      />
      <Card>
        <RowList
          rows={a.rows ?? []}
          onChange={(rows) => updateAttributes({ rows })}
          editable={editable}
        />
      </Card>
    </Block>
  );
}

export function ConfirmationBlockView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const a = node.attrs as { title: string; body: string; signers: string[] };
  const editable = editor.isEditable;
  const signers = a.signers ?? [];
  return (
    <Block selected={selected}>
      <GhostInput
        value={String(a.title ?? "")}
        onChange={(v) => updateAttributes({ title: v })}
        disabled={!editable}
        aria-label="Confirmation title"
        className="font-serif text-[11px] font-bold text-[var(--doc-navy)]"
      />
      <textarea
        value={String(a.body ?? "")}
        disabled={!editable}
        aria-label="Confirmation body"
        rows={2}
        onChange={(e) => updateAttributes({ body: e.target.value })}
        className="mt-1 w-full resize-none rounded bg-transparent px-1 -mx-1 text-[11px] leading-relaxed outline-none focus:bg-[var(--doc-focus)] focus:ring-1 focus:ring-[var(--doc-focus-ring)]/40"
      />
      <div className="mt-6 flex gap-8">
        {signers.map((sn, i) => (
          <div key={i} className="flex-1">
            <div className="border-t border-[var(--doc-line)]" />
            <GhostInput
              value={sn}
              onChange={(v) =>
                updateAttributes({ signers: signers.map((x, j) => (i === j ? v : x)) })
              }
              disabled={!editable}
              aria-label="Signer label"
              className="mt-1 text-[8.5px] text-[var(--doc-muted)]"
            />
          </div>
        ))}
      </div>
    </Block>
  );
}

export function InstructionBlockView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const a = node.attrs as { title: string; bodyMd: string; imageUrls: string[] };
  const editable = editor.isEditable;
  return (
    <Block selected={selected}>
      <GhostInput
        value={String(a.title ?? "")}
        onChange={(v) => updateAttributes({ title: v })}
        disabled={!editable}
        aria-label="Instruction title"
        className="font-serif text-[11px] font-bold text-[var(--doc-navy)]"
      />
      <textarea
        value={String(a.bodyMd ?? "")}
        disabled={!editable}
        aria-label="Instruction body (markdown)"
        rows={4}
        onChange={(e) => updateAttributes({ bodyMd: e.target.value })}
        className="mt-1 w-full resize-y rounded bg-transparent px-1 -mx-1 font-mono text-[10px] leading-relaxed outline-none focus:bg-[var(--doc-focus)] focus:ring-1 focus:ring-[var(--doc-focus-ring)]/40"
      />
      {/* Images are re-attached at render time from the live case — signed URLs
          expire, so they are deliberately not stored in the document. */}
      {(a.imageUrls ?? []).length > 0 && (
        <p className="mt-1 text-[9px] text-[var(--doc-muted-light)]">
          {(a.imageUrls ?? []).length} image(s) attached from the case
        </p>
      )}
    </Block>
  );
}

export function PageBreakView({ selected }: NodeViewProps) {
  return (
    <NodeViewWrapper
      className={cn("doc-block doc-page-break my-5", selected && "opacity-70")}
      contentEditable={false}
    />
  );
}
