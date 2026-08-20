"use client";

import * as React from "react";
import {
  type DraftFields,
  clearDraft,
  draftFieldsEqual,
  purgeExpiredDrafts,
  readDraft,
  writeDraft,
} from "@/lib/form-drafts";

/**
 * Caches a form's unsaved input in localStorage for up to 30 minutes and
 * silently restores it on the next mount (a DraftBanner offers Discard).
 *
 * Capture: a debounced `new FormData(form)` snapshot after any interaction.
 * Select/ComboBox/DatePicker commit their values into named hidden inputs, so
 * the snapshot picks them up with no changes to those components — but their
 * option clicks land in portaled popovers OUTSIDE the form element, so the
 * click/keyup listeners live on `document` and are filtered to the form or any
 * `[data-popover-layer]`. A final snapshot runs when the form unmounts (tab
 * switch, dialog close, case switch), which is what makes those flows lossless
 * without touching Dialog or the tab shell.
 *
 * Restore: happens in a mount effect (never during the first render — the
 * case form is server-rendered and a synchronous read would mismatch
 * hydration). The effect stores the draft and bumps `formKey`; every field's
 * defaultValue must be wired `draft.value("name") ?? serverValue`, so the
 * remount re-reads the drafted values. Controlled fields restore through
 * `onRestore` and revert through `onDiscard`.
 *
 * Never captured: File inputs, password inputs, `exclude`d names.
 */

let purged = false;

type Attachment = {
  el: HTMLFormElement;
  key: string;
  baseline: DraftFields;
  /** A draft was active when this form mounted — keep refreshing it, never auto-clear. */
  hadDraft: boolean;
  /** This attachment has written a draft (so reverting to baseline should clear it). */
  wrote: boolean;
  /** Stop all capture (set by discard/clear right before an intentional remount). */
  disarmed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  removeListeners: () => void;
};

function targetConcernsForm(target: EventTarget | null, form: HTMLFormElement): boolean {
  if (!(target instanceof Node)) return false;
  if (form.contains(target)) return true;
  // Popover layers (Select/ComboBox/DatePicker menus) are portaled to body.
  return target instanceof Element && !!target.closest("[data-popover-layer]");
}

function serializeForm(
  el: HTMLFormElement,
  extra: Record<string, string> | undefined,
  exclude: string[] | undefined
): DraftFields {
  const out: DraftFields = {};
  const passwordNames = new Set(
    Array.from(el.querySelectorAll<HTMLInputElement>('input[type="password"]')).map((i) => i.name)
  );
  const fd = new FormData(el);
  const seen = new Set<string>();
  for (const k of fd.keys()) {
    if (seen.has(k)) continue;
    seen.add(k);
    if (!k || passwordNames.has(k) || exclude?.includes(k)) continue;
    const values = fd.getAll(k).filter((v): v is string => typeof v === "string");
    if (values.length === 0) continue; // File-only entries are never cached
    out[k] = values.length > 1 ? values : values[0];
  }
  for (const [k, v] of Object.entries(extra ?? {})) out[k] = v;
  return out;
}

export interface FormDraft {
  /** Attach to the `<form ref={...}>`. */
  formRef: (el: HTMLFormElement | null) => void;
  /** Non-null while restored values are showing — render a DraftBanner. */
  restoredAt: number | null;
  /** Drafted value for an uncontrolled field: `defaultValue={draft.value("x") ?? server}`. */
  value: (name: string) => string | undefined;
  /** Array variant for repeated names (e.g. ListField rows). */
  valueList: (name: string) => string[] | undefined;
  /** Throw the draft away and re-render the form from server values. */
  discard: () => void;
  /** Forget the draft after a successful save (keeps capturing from a fresh baseline). */
  clear: () => void;
  /** Compose into the form's `key=` so restore/discard can remount the fields. */
  formKey: number;
}

export function useFormDraft(
  key: string,
  opts?: {
    exclude?: string[];
    /** Latest controlled values, merged into every snapshot (fields with no DOM presence). */
    extra?: Record<string, string>;
    /** Apply drafted values to controlled state when a draft is restored. */
    onRestore?: (fields: DraftFields) => void;
    /** Reset controlled state to server values when the user discards. */
    onDiscard?: () => void;
  }
): FormDraft {
  const [restored, setRestored] = React.useState<{ fields: DraftFields; at: number } | null>(null);
  const [formKey, setFormKey] = React.useState(0);

  const optsRef = React.useRef(opts);
  optsRef.current = opts;
  const keyRef = React.useRef(key);
  keyRef.current = key;
  const restoredRef = React.useRef(restored);
  restoredRef.current = restored;
  const attachmentRef = React.useRef<Attachment | null>(null);

  // Entity switched under the same hook (e.g. case chip change) — drop the old
  // restore state now; the [key] effect below reads the new entity's draft.
  const [seenKey, setSeenKey] = React.useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setRestored(null);
  }

  // A detached form node still holds its values, so the same snapshot works
  // both for debounced captures and for the final capture on unmount.
  const snapshot = React.useCallback((att: Attachment) => {
    if (att.disarmed) return;
    const fields = serializeForm(att.el, optsRef.current?.extra, optsRef.current?.exclude);
    // A late-mounting field (the lazy markdown editor) appears in snapshots
    // only after it loads; adopt its first-seen value as pristine.
    for (const k of Object.keys(fields)) {
      if (!(k in att.baseline)) att.baseline[k] = fields[k];
    }
    if (att.hadDraft) {
      // An active draft tracks the form verbatim (and refreshes its TTL).
      writeDraft(att.key, fields);
      att.wrote = true;
    } else if (!draftFieldsEqual(fields, att.baseline)) {
      writeDraft(att.key, fields);
      att.wrote = true;
    } else if (att.wrote) {
      // Typed, then undid every change — leave nothing behind.
      clearDraft(att.key);
      att.wrote = false;
    }
  }, []);

  const formRef = React.useCallback(
    (el: HTMLFormElement | null) => {
      if (el) {
        const att: Attachment = {
          el,
          key: keyRef.current,
          baseline: serializeForm(el, optsRef.current?.extra, optsRef.current?.exclude),
          hadDraft: restoredRef.current !== null,
          wrote: false,
          disarmed: false,
          timer: null,
          removeListeners: () => {},
        };
        const schedule = () => {
          if (att.timer) clearTimeout(att.timer);
          att.timer = setTimeout(() => {
            att.timer = null;
            snapshot(att);
          }, 500);
        };
        const onFormEvent = () => schedule();
        const onDocEvent = (e: Event) => {
          if (targetConcernsForm(e.target, el)) schedule();
        };
        el.addEventListener("input", onFormEvent);
        el.addEventListener("change", onFormEvent);
        document.addEventListener("click", onDocEvent, true);
        document.addEventListener("keyup", onDocEvent, true);
        att.removeListeners = () => {
          el.removeEventListener("input", onFormEvent);
          el.removeEventListener("change", onFormEvent);
          document.removeEventListener("click", onDocEvent, true);
          document.removeEventListener("keyup", onDocEvent, true);
        };
        attachmentRef.current = att;
      } else {
        const att = attachmentRef.current;
        if (att) {
          if (att.timer) clearTimeout(att.timer);
          // The detached node still holds its values — this final snapshot is
          // what preserves input through tab switches and dialog closes.
          snapshot(att);
          att.removeListeners();
          attachmentRef.current = null;
        }
      }
    },
    [snapshot]
  );

  // Silent restore, on mount and whenever the entity key changes.
  React.useEffect(() => {
    if (!purged) {
      purged = true;
      purgeExpiredDrafts();
    }
    const draft = readDraft(key);
    if (!draft) return;
    setRestored(draft);
    // The current attachment (pristine server values) is about to be replaced
    // by the restored remount; keep it from doing anything on the way out.
    if (attachmentRef.current) attachmentRef.current.disarmed = true;
    optsRef.current?.onRestore?.(draft.fields);
    setFormKey((k) => k + 1);
  }, [key]);

  const value = React.useCallback(
    (name: string): string | undefined => {
      const v = restored?.fields[name];
      if (v === undefined) return undefined;
      return Array.isArray(v) ? v[0] : v;
    },
    [restored]
  );

  const valueList = React.useCallback(
    (name: string): string[] | undefined => {
      const v = restored?.fields[name];
      if (v === undefined) return undefined;
      return Array.isArray(v) ? v : [v];
    },
    [restored]
  );

  const discard = React.useCallback(() => {
    clearDraft(keyRef.current);
    const att = attachmentRef.current;
    if (att) att.disarmed = true; // the remount below must not re-write the draft
    setRestored(null);
    optsRef.current?.onDiscard?.();
    setFormKey((k) => k + 1);
  }, []);

  const clear = React.useCallback(() => {
    clearDraft(keyRef.current);
    const att = attachmentRef.current;
    if (att) {
      // Keep capturing (the form may stay open after save), from a fresh baseline.
      att.baseline = serializeForm(att.el, optsRef.current?.extra, optsRef.current?.exclude);
      att.hadDraft = false;
      att.wrote = false;
    }
    setRestored(null);
  }, []);

  return {
    formRef,
    restoredAt: restored?.at ?? null,
    value,
    valueList,
    discard,
    clear,
    formKey,
  };
}
