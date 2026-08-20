"use client";

import * as React from "react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { DraftBanner } from "@/components/ui/draft-banner";
import { toast } from "@/components/ui/toast";
import { useFormDraft } from "@/lib/use-form-draft";
import { createClient } from "@/lib/supabase/client";
import { getOrgId } from "@/lib/supabase/client-org";
import { useOrg } from "@/components/shell/org-context";
import { getLiveRate } from "@/lib/actions/fx";
import { CURRENCIES, formatMoney } from "@/lib/utils";
import type { Case, CounterpartyType, Patient, Payment } from "@/lib/types";
import type { Directories } from "../patient-detail";

/** Must match the server's rounding in upsertPayment, or the optimistic row and
 *  the saved row disagree by a cent. */
const round2 = (n: number) => Math.round(n * 100) / 100;

const PROVIDER_TYPES: { value: CounterpartyType; label: string }[] = [
  { value: "hospital", label: "Hospital" },
  { value: "hotel", label: "Hotel" },
  { value: "driver", label: "Driver" },
  { value: "doctor", label: "Doctor" },
];

export type PaymentValues = {
  case_id: string;
  direction: "in" | "out";
  counterparty_type: string;
  counterparty_id: string | null;
  amount: number;
  currency: string;
  fx_rate: number;
  method: FormDataEntryValue | string;
  iban: FormDataEntryValue | string;
  due_date: FormDataEntryValue | string | null;
  paid_at: FormDataEntryValue | string | null;
  receipt_path: string;
  notes: FormDataEntryValue | string;
};

/**
 * Record/edit a payment. Unlike its predecessor this dialog stays open until
 * the save resolves (failures render inline, where they can be read), and the
 * receipt file is staged locally — nothing touches storage until Save, so a
 * cancelled dialog leaves no orphaned object behind.
 *
 * Remount per open (the parent passes a fresh `key`) so every field resets
 * without effect plumbing.
 */
export function PaymentDialog({
  open,
  onClose,
  editing,
  patient,
  activeCase,
  isAdmin,
  directories,
  onSave,
  onRequestDelete,
}: {
  open: boolean;
  onClose: () => void;
  editing: Payment | null;
  patient: Patient;
  activeCase: Case;
  isAdmin: boolean;
  directories: Directories;
  /** The parent's optimistic mutate — resolves when the server action returns. */
  onSave: (
    values: PaymentValues,
    editingId: string | undefined
  ) => Promise<{ ok: boolean; result?: { error?: string } }>;
  onRequestDelete: (p: Payment) => void;
}) {
  const org = useOrg();
  const caseCurrency = activeCase.currency;
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [direction, setDirection] = React.useState<"in" | "out">(editing?.direction ?? "in");
  const [providerType, setProviderType] = React.useState<CounterpartyType>(
    editing && editing.counterparty_type !== "patient" ? editing.counterparty_type : "hospital"
  );
  const [providerId, setProviderId] = React.useState<string>(editing?.counterparty_id ?? "");
  const [paidAt, setPaidAt] = React.useState<string>(editing?.paid_at ?? "");
  const [currency, setCurrency] = React.useState<string>(editing?.currency ?? caseCurrency);
  const [amount, setAmount] = React.useState<string>(editing ? String(editing.amount ?? "") : "");
  const [fxRate, setFxRate] = React.useState<string>(editing ? String(editing.fx_rate ?? 1) : "1");
  // Provenance of the rate in the field: frozen on the row being edited, fetched
  // live just now, or typed by hand. The live value sticks around after manual
  // edits so we can warn when the typed rate looks inverted.
  const [rateSource, setRateSource] = React.useState<"booked" | "live" | "fallback" | "manual">(
    editing ? "booked" : "manual"
  );
  const [rateAsOf, setRateAsOf] = React.useState<string>("");
  const [liveRate, setLiveRate] = React.useState<number | null>(null);
  const [fetchingRate, setFetchingRate] = React.useState(false);
  // Receipt handling: the already-saved path (edit) plus a locally staged file.
  const [existingReceipt, setExistingReceipt] = React.useState<string>(
    editing?.receipt_path ?? ""
  );
  const [stagedFile, setStagedFile] = React.useState<File | null>(null);

  // 30-minute unsaved-input cache. The provider/currency/rate state has no DOM
  // presence, so it rides `extra`; the staged receipt File and the existing
  // receipt pointer are deliberately never cached (re-attaching is cheap, and
  // restoring a Removed receipt pointer could resurrect it).
  const draft = useFormDraft(`payment:${activeCase.id}:${editing?.id ?? "new"}`, {
    extra: {
      provider_type: providerType,
      provider_id: providerId,
      currency,
      fx_rate: fxRate,
    },
    onRestore: (f) => {
      if (f.direction === "in" || f.direction === "out") setDirection(f.direction);
      if (typeof f.provider_type === "string" && f.provider_type)
        setProviderType(f.provider_type as CounterpartyType);
      if (typeof f.provider_id === "string") setProviderId(f.provider_id);
      if (typeof f.paid_at === "string") setPaidAt(f.paid_at);
      if (typeof f.amount === "string") setAmount(f.amount);
      if (typeof f.currency === "string" && f.currency) {
        setCurrency(f.currency);
        if (typeof f.fx_rate === "string" && f.fx_rate) {
          setFxRate(f.fx_rate);
          // The restored rate was typed/fetched in the previous session; treat
          // it as manual so the provenance copy stays honest.
          if (f.currency !== caseCurrency) setRateSource("manual");
        }
      }
    },
    onDiscard: () => {
      setDirection(editing?.direction ?? "in");
      setProviderType(
        editing && editing.counterparty_type !== "patient" ? editing.counterparty_type : "hospital"
      );
      setProviderId(editing?.counterparty_id ?? "");
      setPaidAt(editing?.paid_at ?? "");
      setCurrency(editing?.currency ?? caseCurrency);
      setAmount(editing ? String(editing.amount ?? "") : "");
      setFxRate(editing ? String(editing.fx_rate ?? 1) : "1");
      setRateSource(editing ? "booked" : "manual");
    },
  });

  /** Prefill the rate from the live feed. Failure is silent-ish: the field stays
   *  editable and the save path is never blocked. */
  async function pullLiveRate(from: string) {
    if (from === caseCurrency) return;
    setFetchingRate(true);
    const r = await getLiveRate(from, caseCurrency);
    setFetchingRate(false);
    if (r.error || r.rate === undefined) {
      toast.error(r.error ?? "Could not fetch a rate — enter it manually.");
      return;
    }
    setFxRate(String(r.rate));
    setLiveRate(r.rate);
    setRateSource(r.source!);
    setRateAsOf(r.asOf!);
  }

  function onCurrencyChange(next: string) {
    setCurrency(next);
    if (next === caseCurrency) {
      setFxRate("1");
      setRateSource("manual");
      return;
    }
    // Reopening an old row must keep the rate it was booked at — freezing it is
    // the whole point — so only fetch when the currency actually changes.
    if (editing && next === editing.currency) {
      setFxRate(String(editing.fx_rate ?? 1));
      setRateSource("booked");
      return;
    }
    pullLiveRate(next);
  }

  // The classic FX data-entry error is entering the inverse rate. Flag a manual
  // value wildly off the fetched one; never block — the operator may know better.
  const rateNumber = Number(fxRate) || 0;
  const rateLooksInverted =
    rateSource === "manual" &&
    liveRate !== null &&
    rateNumber > 0 &&
    (rateNumber / liveRate > 3 || liveRate / rateNumber > 3);

  async function viewReceipt(path: string) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
    if (error || !data) toast.error(error?.message ?? "Could not open receipt");
    else window.open(data.signedUrl, "_blank");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const rate = currency === caseCurrency ? 1 : Number(fxRate) || 0;

    // Upload the staged receipt only now, at save time. If the action below then
    // fails we remove the object again, so storage never holds an orphan.
    let uploadedPath: string | null = null;
    const supabase = createClient();
    if (stagedFile) {
      const orgId = await getOrgId();
      if (!orgId) {
        setError("Could not resolve your organization — sign in again.");
        setSaving(false);
        return;
      }
      // Org prefix first: storage RLS (0025) scopes access to folder 1.
      const path = `${orgId}/${activeCase.id}/${Date.now()}-${stagedFile.name}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, stagedFile);
      if (upErr) {
        setError(`Receipt upload failed: ${upErr.message}`);
        setSaving(false);
        return;
      }
      uploadedPath = path;
    }

    const values: PaymentValues = {
      case_id: activeCase.id,
      direction,
      counterparty_type: direction === "in" ? "patient" : providerType,
      counterparty_id: direction === "in" ? null : providerId || null,
      amount: Number(amount || 0),
      currency,
      fx_rate: rate,
      method: fd.get("method") ?? "",
      iban: fd.get("iban") ?? "",
      due_date: fd.get("due_date") || null,
      paid_at: fd.get("paid_at") || null,
      receipt_path: uploadedPath ?? existingReceipt,
      notes: fd.get("notes") ?? "",
    };

    const { ok, result } = await onSave(values, editing?.id);
    setSaving(false);
    if (!ok) {
      if (uploadedPath) await supabase.storage.from("receipts").remove([uploadedPath]);
      setError(result?.error ?? "Something went wrong. Please try again.");
      return;
    }
    // The old object is only unreferenced once the save actually landed.
    const replacedOld =
      editing?.receipt_path && editing.receipt_path !== values.receipt_path
        ? editing.receipt_path
        : null;
    if (replacedOld) await supabase.storage.from("receipts").remove([replacedOld]);
    draft.clear();
    onClose();
  }

  const providerChoices = isAdmin
    ? PROVIDER_TYPES
    : PROVIDER_TYPES.filter((c) => c.value !== "doctor");

  function providerOptions(type: CounterpartyType) {
    switch (type) {
      case "doctor":
        return directories.doctors;
      case "hospital":
        return directories.hospitals;
      case "hotel":
        return directories.hotels;
      case "driver":
        return directories.drivers;
      default:
        return [];
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit payment" : "Record payment"}
      wide
    >
      <form
        key={draft.formKey}
        ref={draft.formRef}
        onSubmit={onSubmit}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <DraftBanner draft={draft} className="sm:col-span-2" />
        <Field label="Direction">
          <Select
            name="direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as "in" | "out")}
          >
            <option value="in">Incoming — patient pays {org.name}</option>
            <option value="out">Outgoing — {org.name} pays a provider</option>
          </Select>
        </Field>
        {direction === "in" ? (
          <Field label="From">
            <Input value={patient.full_name} disabled readOnly />
          </Field>
        ) : (
          <>
            <Field label="Provider type">
              <Select
                value={providerType}
                onChange={(e) => {
                  setProviderType(e.target.value as CounterpartyType);
                  setProviderId(""); // clear stale id from the previous type's directory
                }}
              >
                {providerChoices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Provider" className="sm:col-span-2">
              <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                <option value="">— select —</option>
                {providerOptions(providerType).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <Field label="Amount">
          <Input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Currency">
          <Select value={currency} onChange={(e) => onCurrencyChange(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        {currency !== caseCurrency && (
          // The case is priced in one currency and this payment arrived in
          // another. The rate is frozen onto the row, so an old payment keeps
          // the rate it was booked at no matter what the market does later.
          <div className="sm:col-span-2 space-y-2 rounded-xl border border-dashed border-border-strong p-3">
            <div className="flex flex-wrap items-end gap-3">
              {/* Labelled as a full sentence: rate direction is the classic
                  data-entry error. */}
              <Field label={`Rate — 1 ${currency} = ? ${caseCurrency}`} className="flex-1">
                <Input
                  type="number"
                  step="0.00000001"
                  min="0"
                  inputMode="decimal"
                  value={fxRate}
                  onChange={(e) => {
                    setFxRate(e.target.value);
                    setRateSource("manual");
                  }}
                />
              </Field>
              <Button
                type="button"
                variant="soft"
                size="sm"
                pending={fetchingRate}
                onClick={() => pullLiveRate(currency)}
              >
                Use live rate
              </Button>
            </div>
            {rateSource === "live" && (
              <p className="text-xs text-muted">Live rate as of {rateAsOf}.</p>
            )}
            {rateSource === "fallback" && (
              <p className="text-xs text-warning">
                Live rates unavailable — showing the stored table from {rateAsOf}. Confirm against
                your bank before saving.
              </p>
            )}
            {rateSource === "booked" && editing && (
              <p className="text-xs text-muted">
                Rate frozen when this payment was booked. Edit it or press “Use live rate” to
                replace it.
              </p>
            )}
            {rateSource === "manual" && !rateLooksInverted && liveRate !== null && (
              <p className="text-xs text-muted">Manual rate (today’s live rate: {liveRate}).</p>
            )}
            {rateLooksInverted && (
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                This is far from today’s rate of {liveRate} — check the direction: the rate is 1{" "}
                {currency} = ? {caseCurrency}.
              </p>
            )}
            <p className="text-sm font-medium tabular-nums">
              {formatMoney(Number(amount) || 0, currency)}{" "}
              <span className="text-muted">→</span>{" "}
              {formatMoney(round2((Number(amount) || 0) * rateNumber), caseCurrency)}
              <span className="ml-1.5 text-xs font-normal text-muted-light">
                counts toward the case total
              </span>
            </p>
          </div>
        )}
        <Field label="Method">
          <Input
            name="method"
            placeholder="Bank transfer, cash, card…"
            defaultValue={draft.value("method") ?? editing?.method ?? ""}
          />
        </Field>
        <Field label="IBAN">
          <Input
            name="iban"
            autoComplete="off"
            autoCapitalize="characters"
            pattern="[A-Za-z]{2}[0-9A-Za-z ]*"
            title="IBAN, e.g. TR12 0006 4000 0011 2345 6789 01"
            placeholder="TR12 0006 4000 0011 2345 6789 01"
            defaultValue={draft.value("iban") ?? editing?.iban ?? ""}
          />
        </Field>
        <Field label="Due date">
          <DatePicker name="due_date" defaultValue={draft.value("due_date") ?? editing?.due_date ?? ""} />
        </Field>
        <Field label="Paid date — leave empty until paid">
          <div className="flex items-center gap-2">
            <DatePicker name="paid_at" value={paidAt} onChange={setPaidAt} className="flex-1" />
            {!paidAt && (
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={() => setPaidAt(new Date().toISOString().slice(0, 10))}
              >
                Mark paid today
              </Button>
            )}
          </div>
        </Field>
        <div className="sm:col-span-2 -mt-1 text-xs text-muted-light">
          Status is set automatically: <span className="font-medium text-success">Paid</span> once a
          paid date is set, otherwise <span className="font-medium text-warning">Pending</span>.
        </div>
        <Field label="Receipt" className="sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted shadow-card transition-colors hover:border-primary hover:text-primary">
              <Upload className="size-4" />
              {stagedFile
                ? stagedFile.name
                : existingReceipt
                  ? "Replace receipt"
                  : "Attach receipt"}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setStagedFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {stagedFile && (
              <>
                {/* Nothing is uploaded yet — the file goes to storage on Save. */}
                <span className="text-xs text-muted-light">Uploads when you save</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setStagedFile(null)}>
                  Discard
                </Button>
              </>
            )}
            {!stagedFile && existingReceipt && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => viewReceipt(existingReceipt)}
                >
                  <Paperclip /> View
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger-soft"
                  onClick={() => setExistingReceipt("")}
                >
                  Remove
                </Button>
              </>
            )}
          </div>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Input name="notes" defaultValue={draft.value("notes") ?? editing?.notes ?? ""} />
        </Field>
        {error && (
          <p className="sm:col-span-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <div>
            {editing && isAdmin && (
              <Button
                type="button"
                variant="ghost"
                className="text-danger hover:bg-danger-soft"
                onClick={() => onRequestDelete(editing)}
              >
                <Trash2 /> Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {/* Cancel is an explicit discard — Esc/backdrop keep the draft. */}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                draft.clear();
                onClose();
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" pending={saving}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
