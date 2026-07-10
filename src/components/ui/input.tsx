"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-lg border border-border bg-surface px-3 py-1 text-sm text-foreground shadow-card transition-colors placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-card placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

interface OptionDef {
  value: string;
  label: React.ReactNode;
  /** Flattened text of the label, used for searching. */
  text: string;
  disabled?: boolean;
}

/** Recursively flatten a React node into plain searchable text. */
function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(" ");
  if (React.isValidElement(node)) {
    return nodeText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

function collectOptions(children: React.ReactNode): OptionDef[] {
  const out: OptionDef[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === "option") {
      const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
      out.push({
        value: String(props.value ?? ""),
        label: props.children,
        text: nodeText(props.children),
        disabled: props.disabled,
      });
    } else {
      const props = child.props as { children?: React.ReactNode };
      if (props.children) out.push(...collectOptions(props.children));
    }
  });
  return out;
}

// Show the search box only once a dropdown has enough options to be worth filtering.
const SEARCH_THRESHOLD = 7;

/**
 * Custom dropdown with the same call-site API as a native <select>
 * (children <option>s, name, value/defaultValue, onChange with target.value),
 * rendered as a themed popover listbox.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, name, value, defaultValue, onChange, disabled }) => {
  const options = collectOptions(children);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [internal, setInternal] = React.useState(String(defaultValue ?? options[0]?.value ?? ""));
  const current = value !== undefined ? String(value) : internal;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const showSearch = options.length > SEARCH_THRESHOLD;
  const filtered = query
    ? options.filter((o) => o.text.toLowerCase().includes(query.toLowerCase()))
    : options;

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) {
      // Reset the query each open, then focus search or scroll to selection.
      setQuery("");
      if (showSearch) {
        searchRef.current?.focus();
      } else {
        listRef.current
          ?.querySelector("[data-selected=true]")
          ?.scrollIntoView({ block: "nearest" });
      }
    }
  }, [open, showSearch]);

  const selected = options.find((o) => o.value === current);

  function pick(v: string) {
    if (value === undefined) setInternal(v);
    onChange?.({ target: { value: v } } as unknown as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-foreground shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50 cursor-pointer",
          open && "ring-2 ring-[var(--ring)]"
        )}
      >
        <span className={cn("truncate text-left", !selected?.label && "text-muted-light")}>
          {selected?.label ?? "—"}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-light transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="animate-dropdown absolute z-50 mt-1 w-full min-w-max rounded-lg border border-border bg-surface p-1 shadow-pop">
          {showSearch && (
            <div className="relative mb-1 px-1 pt-1">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-light" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const first = filtered.find((o) => !o.disabled);
                    if (first) pick(first.value);
                  }
                }}
                placeholder="Search…"
                className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </div>
          )}
          <div ref={listRef} className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-2.5 py-2 text-sm text-muted-light">No matches</p>
            )}
            {filtered.map((o, i) => (
              <button
                key={o.value + i}
                type="button"
                disabled={o.disabled}
                data-selected={o.value === current}
                onClick={() => pick(o.value)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors cursor-pointer",
                  o.value === current
                    ? "bg-primary-soft font-medium text-primary"
                    : "hover:bg-surface-hover",
                  o.disabled && "opacity-50"
                )}
              >
                <span className="truncate">{o.label}</span>
                {o.value === current && <Check className="size-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-xs font-medium text-muted mb-1.5 block", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
