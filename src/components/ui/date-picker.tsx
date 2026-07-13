"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { cn } from "@/lib/utils";
import { usePresence } from "@/lib/use-presence";
import { Select, PopoverLayer, isInsidePopover } from "./input";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function Calendar({
  selected,
  onSelect,
}: {
  selected: Date | null;
  onSelect: (d: Date) => void;
}) {
  const [view, setView] = React.useState(() => startOfMonth(selected ?? new Date()));
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(view), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(view), { weekStartsOn: 1 }),
  });
  const today = new Date();

  return (
    <div className="w-64 select-none p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setView((v) => addMonths(v, -1))}
          className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground cursor-pointer"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-1">
          <Select
            value={String(view.getMonth())}
            onChange={(e) => setView(new Date(view.getFullYear(), Number(e.target.value), 1))}
            className="w-28"
          >
            {Array.from({ length: 12 }, (_, m) => (
              <option key={m} value={String(m)}>
                {format(new Date(2000, m, 1), "MMM")}
              </option>
            ))}
          </Select>
          <Select
            value={String(view.getFullYear())}
            onChange={(e) => setView(new Date(Number(e.target.value), view.getMonth(), 1))}
            className="w-22"
          >
            {Array.from({ length: 111 }, (_, i) => today.getFullYear() + 5 - i).map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={() => setView((v) => addMonths(v, 1))}
          className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground cursor-pointer"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1 text-[10px] font-semibold uppercase text-muted-light">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const isSelected = selected && isSameDay(day, selected);
          const isToday = isSameDay(day, today);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(day)}
              aria-label={format(day, "d MMMM yyyy")}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected ?? undefined}
              className={cn(
                "rounded-md py-1.5 text-xs transition-colors cursor-pointer",
                !isSameMonth(day, view) && "text-muted-light/50",
                isSelected
                  ? "bg-primary font-semibold text-primary-fg"
                  : isToday
                    ? "bg-primary-soft font-semibold text-primary"
                    : "hover:bg-surface-hover"
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onSelect(today)}
        className="mt-2 w-full rounded-md py-1.5 text-xs font-medium text-primary hover:bg-primary-soft cursor-pointer"
      >
        Today
      </button>
    </div>
  );
}

function usePopover() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!isInsidePopover(e.target, ref.current)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/**
 * Custom themed date picker. Submits `name` as YYYY-MM-DD (empty when cleared),
 * so it drops into existing forms exactly like <input type="date">.
 */
export function DatePicker({
  name,
  value,
  defaultValue,
  onChange,
  placeholder = "Pick a date",
  className,
}: {
  name?: string;
  value?: string; // controlled (YYYY-MM-DD or "")
  defaultValue?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { open, setOpen, ref } = usePopover();
  const { mounted, closing } = usePresence(open, 150);
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const current = value !== undefined ? value : internal;
  const selected = current ? parseISO(current) : null;

  function set(v: string) {
    if (value === undefined) setInternal(v);
    onChange?.(v);
    setOpen(false);
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={current} />}
      {/* Trigger and clear are siblings (not nested) so both are real, keyboard-
          operable buttons — nesting a button inside a button is invalid. */}
      <div
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm shadow-card transition-colors focus-within:ring-2 focus-within:ring-[var(--ring)]",
          !current && "text-muted-light"
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Choose date"
          className="flex flex-1 items-center gap-2 text-left focus:outline-none cursor-pointer"
        >
          <CalendarDays className="size-4 shrink-0 text-muted" />
          <span className="flex-1 text-left">
            {selected ? format(selected, "d MMM yyyy") : placeholder}
          </span>
        </button>
        {current && (
          <button
            type="button"
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              set("");
            }}
            className="shrink-0 rounded p-0.5 text-muted-light hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {mounted && (
        <PopoverLayer
          anchorRef={ref}
          className={cn(
            "animate-dropdown rounded-xl border border-border bg-surface shadow-pop",
            closing && "animate-dropdown-out"
          )}
        >
          <Calendar selected={selected} onSelect={(d) => set(format(d, "yyyy-MM-dd"))} />
        </PopoverLayer>
      )}
    </div>
  );
}

/** Date + time picker. Submits `name` as "YYYY-MM-DDTHH:mm" (datetime-local format). */
export function DateTimePicker({
  name,
  defaultValue,
  className,
}: {
  name: string;
  defaultValue?: string; // YYYY-MM-DDTHH:mm
  className?: string;
}) {
  const [date, setDate] = React.useState(defaultValue?.slice(0, 10) ?? "");
  const [time, setTime] = React.useState(defaultValue?.slice(11, 16) || "09:00");

  return (
    <div className={cn("flex gap-1.5", className)}>
      <input type="hidden" name={name} value={date ? `${date}T${time}` : ""} />
      <DatePicker value={date} onChange={setDate} className="flex-1" />
      <Select
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="w-24 shrink-0"
      >
        {Array.from({ length: 48 }, (_, i) => {
          const h = String(Math.floor(i / 2)).padStart(2, "0");
          const m = i % 2 ? "30" : "00";
          return (
            <option key={i} value={`${h}:${m}`}>
              {h}:{m}
            </option>
          );
        })}
      </Select>
    </div>
  );
}
