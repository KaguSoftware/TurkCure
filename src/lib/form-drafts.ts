/**
 * Best-effort localStorage persistence for unsaved form input ("drafts").
 *
 * Storage layer only — no React. Each draft is one key (`tc:draft:<entity key>`)
 * holding the form's serialized fields plus a timestamp; drafts older than
 * DRAFT_TTL_MS are treated as absent and deleted on read. Every operation is
 * wrapped so a full quota, disabled storage or SSR context degrades to "no
 * drafts" rather than breaking the form. See `use-form-draft.ts` for the hook
 * that feeds this.
 */

/** A field value is a string, or a string[] for repeated names (e.g. ListField). */
export type DraftFields = Record<string, string | string[]>;

type StoredDraft = { v: 1; at: number; fields: DraftFields };

const PREFIX = "tc:draft:";
export const DRAFT_TTL_MS = 30 * 60 * 1000;

function storageKey(key: string) {
  return PREFIX + key;
}

export function readDraft(key: string): { fields: DraftFields; at: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (parsed?.v !== 1 || typeof parsed.at !== "number" || !parsed.fields) {
      window.localStorage.removeItem(storageKey(key));
      return null;
    }
    if (Date.now() - parsed.at > DRAFT_TTL_MS) {
      window.localStorage.removeItem(storageKey(key));
      return null;
    }
    return { fields: parsed.fields, at: parsed.at };
  } catch {
    return null;
  }
}

export function writeDraft(key: string, fields: DraftFields): void {
  if (typeof window === "undefined") return;
  try {
    const draft: StoredDraft = { v: 1, at: Date.now(), fields };
    window.localStorage.setItem(storageKey(key), JSON.stringify(draft));
  } catch {
    // Quota / privacy mode — drafting is best-effort, never surface an error.
  }
}

export function clearDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(key));
  } catch {
    // ignore
  }
}

/** Drop every expired or unparseable draft. Called once per page load. */
export function purgeExpiredDrafts(): void {
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(k) ?? "") as StoredDraft;
        if (parsed?.v !== 1 || Date.now() - parsed.at > DRAFT_TTL_MS) doomed.push(k);
      } catch {
        doomed.push(k);
      }
    }
    doomed.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/** Deep-equal for two field maps, order-independent. */
export function draftFieldsEqual(a: DraftFields, b: DraftFields): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) {
    const av = a[k];
    const bv = b[k];
    if (Array.isArray(av) || Array.isArray(bv)) {
      const aa = Array.isArray(av) ? av : [av];
      const ba = Array.isArray(bv) ? bv : [bv as string];
      if (aa.length !== ba.length || aa.some((v, i) => v !== ba[i])) return false;
    } else if (av !== bv) {
      return false;
    }
  }
  return true;
}
