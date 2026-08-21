import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DATE_ONLY_RE, parseDateOnly } from "@/lib/dates";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CURRENCIES = ["EUR", "USD", "GBP", "TRY"] as const;
export type Currency = (typeof CURRENCIES)[number];

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  TRY: "₺",
};

export function formatMoney(amount: number, currency: string) {
  const symbol = CURRENCY_SYMBOLS[currency as Currency] ?? currency + " ";
  return `${symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** wa.me link from a phone number (keeps a leading +, strips other non-digits). */
export function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return "—";
  // Date-only strings must parse as a LOCAL day: new Date("YYYY-MM-DD") is UTC
  // midnight, which renders as the previous day for any viewer west of UTC —
  // and disagrees with the DatePicker, which parses the same value locally.
  const value =
    typeof date === "string" && DATE_ONLY_RE.test(date) ? parseDateOnly(date) : new Date(date);
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** URL/file-safe handle from a display name ("Ayşe Clinic" → "ayse-clinic"). */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip combining diacritics left by NFD
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org"
  );
}
