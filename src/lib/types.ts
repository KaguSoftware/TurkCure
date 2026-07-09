export type Role = "admin" | "agent";
export type PatientStatus = "lead" | "interested" | "booked" | "treated" | "aftercare" | "lost";
export type CaseStatus = "planning" | "confirmed" | "in_progress" | "completed" | "cancelled";
export type QuoteItemKind = "surgery" | "hotel" | "transfer" | "extra";
export type PaymentDirection = "in" | "out";
export type CounterpartyType = "patient" | "hotel" | "doctor" | "hospital" | "driver";
export type PaymentStatus = "pending" | "partial" | "paid";
export type ReminderType = "follow_up" | "arrival" | "operation" | "payment" | "aftercare";

export const PATIENT_STATUSES: PatientStatus[] = [
  "lead",
  "interested",
  "booked",
  "treated",
  "aftercare",
  "lost",
];

export interface Profile {
  id: string;
  name: string;
  role: Role;
  active: boolean;
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
  vehicle: string;
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
  operation_type_id: string | null;
  doctor_id: string | null;
  hospital_id: string | null;
  hotel_id: string | null;
  driver_id: string | null;
  arrival_date: string | null;
  surgery_date: string | null;
  departure_date: string | null;
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

export interface Payment {
  id: string;
  case_id: string;
  direction: PaymentDirection;
  counterparty_type: CounterpartyType;
  counterparty_id: string | null;
  amount: number;
  currency: string;
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
  created_at: string;
}

export interface CaseInstruction {
  id: string;
  case_id: string;
  template_id: string | null;
  title: string;
  body_md: string;
}
