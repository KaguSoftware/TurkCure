"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";
import { HORIZON_OPTIONS } from "./horizon";

/**
 * The dashboard's look-ahead window, persisted in ?days= so it survives
 * refresh and can be deep-linked. Applies to reminders, upcoming arrivals
 * and payments due; 14 stays the default (and keeps the URL clean).
 */
export function HorizonSelect({ value }: { value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      aria-label="How far ahead to look"
      className="w-36"
      value={String(value)}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value === "14") params.delete("days");
        else params.set("days", e.target.value);
        router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
      }}
    >
      {HORIZON_OPTIONS.map((d) => (
        <option key={d} value={String(d)}>
          Next {d} days
        </option>
      ))}
    </Select>
  );
}
