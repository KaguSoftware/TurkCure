"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A table cell value that edits in place: click (or focus + Enter) swaps the
 * display for an input; Enter/Tab/blur commit, Esc cancels. Commit only fires
 * when the value actually changed, so tabbing through a row is free.
 *
 * The parent owns persistence — `onCommit` typically fires an optimistic
 * mutation. Suggestions render as a native <datalist> rather than the ComboBox:
 * a portaled popover inside a scrolling table cell is more machinery than a
 * pick-or-type field needs here.
 */
export function EditableCell({
  value,
  display,
  type = "text",
  align = "left",
  placeholder = "—",
  suggestions,
  disabled = false,
  ariaLabel,
  className,
  onCommit,
}: {
  /** The raw editable value (what appears in the input). */
  value: string;
  /** Optional formatted display (e.g. money) shown when not editing. */
  display?: React.ReactNode;
  type?: "text" | "money";
  align?: "left" | "right";
  placeholder?: string;
  suggestions?: string[];
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Esc must cancel without the ensuing blur re-committing the draft.
  const cancelled = React.useRef(false);
  const listId = React.useId();

  function open() {
    if (disabled) return;
    cancelled.current = false;
    setDraft(value);
    setEditing(true);
  }

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    if (cancelled.current) return;
    const next = draft.trim();
    if (next === value.trim()) return;
    onCommit(next);
  }

  if (editing) {
    return (
      <>
        <input
          ref={inputRef}
          type={type === "money" ? "number" : "text"}
          step={type === "money" ? "0.01" : undefined}
          min={type === "money" ? "0" : undefined}
          inputMode={type === "money" ? "decimal" : undefined}
          list={suggestions ? listId : undefined}
          value={draft}
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              inputRef.current?.blur(); // commit via the single blur path
            } else if (e.key === "Escape") {
              cancelled.current = true;
              inputRef.current?.blur();
            }
            // Tab falls through: the browser moves focus, blur commits.
          }}
          className={cn(
            "h-8 w-full min-w-16 rounded-md border border-border bg-surface px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            align === "right" && "text-right tabular-nums",
            className
          )}
        />
        {suggestions && (
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Edit ${ariaLabel}`}
      disabled={disabled}
      onClick={open}
      className={cn(
        // Quiet in display mode — the value should read as text, not a control;
        // a faint hover wash is the whole affordance (the card header says
        // "click any cell to edit").
        "block h-8 w-full min-w-16 cursor-text rounded-md px-2 text-sm leading-8 transition-colors",
        !disabled && "hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        align === "right" ? "text-right tabular-nums" : "text-left",
        disabled && "cursor-default",
        className
      )}
    >
      {display ?? (value !== "" ? value : <span className="text-muted-light">{placeholder}</span>)}
    </button>
  );
}
