export type Role = "admin" | "agent";
export type PatientStatus = "lead" | "interested" | "booked" | "treated" | "aftercare" | "lost";
export type CaseStatus = "planning" | "confirmed" | "in_progress" | "completed" | "cancelled";
/**
 * Free text since 0017 — the four values below are suggestions, not a closed
 * set, and an empty label is valid.
 */
export type QuoteItemKind = string;
export type PaymentDirection = "in" | "out";
export type CounterpartyType = "patient" | "hotel" | "doctor" | "hospital" | "driver";
// "partial" still exists in the DB enum but nothing can produce it since 0022
// normalized the legacy rows — status is derived paid/pending from paid_at.
export type PaymentStatus = "pending" | "paid";
export type ReminderType =
  | "follow_up"
  | "arrival"
  | "operation"
  | "payment"
  | "aftercare"
  /** Hospital check-in and check-out (0018). */
  | "hospital"
  /** Flight home (0018). */
  | "departure";
export type FileCategory = "reports" | "passport" | "other";

export const PATIENT_STATUSES: PatientStatus[] = [
  "lead",
  "interested",
  "booked",
  "treated",
  "aftercare",
  "lost",
];

/** Order matters — the Files tab renders its sections in this order. */
export const FILE_CATEGORIES: { value: FileCategory; label: string; hint: string }[] = [
  { value: "reports", label: "Reports", hint: "Scans, lab results and medical reports (PDF or image)" },
  { value: "passport", label: "Passport", hint: "Passport and ID scans" },
  { value: "other", label: "Other", hint: "Anything else — contracts, tickets, correspondence" },
];

export type AccentTheme = "default" | "violet" | "emerald" | "amber";

export const ACCENT_THEMES: { value: AccentTheme; label: string }[] = [
  { value: "default", label: "Company colors" },
  { value: "violet", label: "Violet" },
  { value: "emerald", label: "Emerald" },
  { value: "amber", label: "Amber" },
];

export interface Profile {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  accent_theme: AccentTheme;
  avatar_url: string | null;
  /** The organization this user belongs to — exactly one, set at creation (0023). */
  org_id: string;
  /** Platform owner flag: unlocks /admin. NOT an org role — RLS never reads it. */
  is_super: boolean;
  /** Auth email; attached by getProfile(), not a profiles column. */
  email?: string;
}

/** One tenant company (0023). Branding drives the app accent and the PDFs. */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  active: boolean;
  created_at: string;
  logo_url: string | null;
  /** Printed company name on PDFs; may differ from the display name. */
  company_name: string;
  whatsapp: string;
  /** Display form, e.g. "Turkcure.com". */
  website: string;
  /** Link form, e.g. "https://turkcure.com". */
  url: string;
  location: string;
  /** PDF footer postal address. */
  address: string;
  /** Cover tagline. */
  tagline: string;
  brand_primary: string;
  pdf_cover_bg: string;
  pdf_cover_accent: string;
}

export interface Country {
  id: string;
  name: string;
  code: string;
}

export interface Hospital {
  id: string;
  name: string;
  city: string;
  contact: string;
  notes: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  hospital_id: string | null;
  contact: string;
  notes: string;
  hospitals?: { name: string } | null;
}

export interface Hotel {
  id: string;
  name: string;
  city: string;
  stars: number | null;
  contact: string;
  notes: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicles: string[];
  notes: string;
}

export interface OperationType {
  id: string;
  name: string;
  category: string;
  default_nights: number;
}

export interface InstructionTemplate {
  id: string;
  operation_type_id: string | null;
  title: string;
  body_md: string;
  language: string;
  operation_types?: { name: string } | null;
}

export interface Patient {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  gender: string;
  passport_number: string;
  country_id: string | null;
  source: string;
  status: PatientStatus;
  assigned_agent_id: string | null;
  notes: string;
  created_at: string;
  countries?: { name: string } | null;
  profiles?: { name: string } | null;
}

export interface Case {
  id: string;
  patient_id: string;
  protocol_number: string;
  operation_type_id: string | null;
  doctor_id: string | null;
  hospital_id: string | null;
  hotel_id: string | null;
  driver_id: string | null;
  arrival_date: string | null;
  surgery_date: string | null;
  departure_date: string | null;
  hospital_checkin: string | null;
  hospital_checkout: string | null;
  airport: string;
  airport_pickup: string;
  currency: string;
  status: CaseStatus;
  notes: string;
  operation_types?: { name: string } | null;
  doctors?: { name: string } | null;
  hospitals?: { name: string } | null;
  hotels?: { name: string } | null;
  drivers?: { name: string } | null;
  patients?: { full_name: string } | null;
}

export interface QuoteItem {
  id: string;
  case_id: string;
  kind: QuoteItemKind;
  description: string;
  cost?: number; // present only for admins
  price: number;
  sort_order: number;
}

/**
 * A per-case extra shown on the PDF under Payment Information. Deliberately
 * outside `quote_items`: never summed into the package total, never seen by
 * finance_case_rows(). See 0020.
 */
export interface CaseAdditionalCost {
  id: string;
  case_id: string;
  title: string;
  amount: number;
  sort_order: number;
}

export interface Payment {
  id: string;
  case_id: string;
  direction: PaymentDirection;
  counterparty_type: CounterpartyType;
  counterparty_id: string | null;
  amount: number;
  currency: string;
  /** Multiplier from `currency` to the case currency, frozen when booked (0016). */
  fx_rate: number;
  /** `amount * fx_rate`, 2dp — the figure every total sums. */
  amount_case: number;
  method: string;
  iban: string;
  due_date: string | null;
  paid_at: string | null;
  status: PaymentStatus;
  receipt_path: string;
  notes: string;
}

export interface Reminder {
  id: string;
  type: ReminderType;
  patient_id: string | null;
  case_id: string | null;
  title: string;
  note: string;
  due_at: string;
  assigned_to: string | null;
  done_at: string | null;
  patients?: { full_name: string } | null;
}

export interface PatientFile {
  id: string;
  patient_id: string;
  storage_path: string;
  label: string;
  category: FileCategory;
  uploaded_by: string | null;
  created_at: string;
}

export interface CaseInstruction {
  id: string;
  case_id: string;
  template_id: string | null;
  title: string;
  body_md: string;
  image_paths: string[];
}
