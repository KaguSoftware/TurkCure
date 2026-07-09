import * as React from "react";
import { cn } from "@/lib/utils";

export type Tone = "slate" | "green" | "blue" | "violet" | "teal" | "red" | "amber";

const tones: Record<Tone, string> = {
  slate: "bg-surface-hover text-muted",
  green: "bg-success-soft text-success",
  blue: "bg-primary-soft text-primary",
  violet: "bg-violet-soft text-violet",
  teal: "bg-info-soft text-info",
  red: "bg-danger-soft text-danger",
  amber: "bg-warning-soft text-warning",
};

export function Badge({
  tone = "slate",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

export const PATIENT_STATUS_TONE: Record<string, Tone> = {
  lead: "slate",
  interested: "green",
  booked: "blue",
  treated: "violet",
  aftercare: "teal",
  lost: "red",
};

export const PATIENT_STATUS_LABEL: Record<string, string> = {
  lead: "Lead",
  interested: "Interested",
  booked: "Booked",
  treated: "Treated",
  aftercare: "Aftercare",
  lost: "Lost",
};

export const PAYMENT_STATUS_TONE: Record<string, Tone> = {
  pending: "amber",
  partial: "blue",
  paid: "green",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={PATIENT_STATUS_TONE[status] ?? "slate"}>
      {PATIENT_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
