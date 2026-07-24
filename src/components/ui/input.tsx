"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePresence } from "@/lib/use-presence";

/**
 * Renders popover content in a body portal, fixed-positioned against the
 * anchor. This keeps dropdowns as true overlays: they can't be clipped by
 * overflow containers (tables) or painted under sibling stacking contexts
 * (animated/faded rows). Flips above the anchor when there's no room below.
 */
export function PopoverLayer({
  anchorRef,
  className,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [style, setStyle] = React.useState<React.CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  const position = React.useCallback(() => {
    const anchor = anchorRef.current;
    const menu = ref.current;
    if (!anchor || !menu) return;
    const r = anchor.getBoundingClientRect();
    const menuH = menu.offsetHeight;
    const menuW = Math.max(menu.offsetWidth, r.width);
    const openUp = r.bottom + 4 + menuH > window.innerHeight && r.top - 4 - menuH > 0;
    const top = openUp ? r.top - 4 - menuH : r.bottom + 4;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - menuW - 8));
    setStyle({
      position: "fixed",
      top,
      left,
      minWidth: r.width,
      transformOrigin: openUp ? "bottom" : "top",
    });
  }, [anchorRef]);

  React.useLayoutEffect(() => {
    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [position]);

  return createPortal(
    <div ref={ref} data-popover-layer style={style} className={cn("z-50", className)}>
      {children}
    </div>,
    document.body
  );
}

/**
 * True when a pointer event landed inside the given root or inside any
 * portaled popover layer (which lives outside the root in the DOM).
 */
export function isInsidePopover(target: EventTarget | null, root: HTMLElement | null): boolean {
  if (!(target instanceof Node)) return false;
  if (root?.contains(target)) return true;
  return target instanceof Element && !!target.closest("[data-popover-layer]");
}

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
>(({ className, children, name, value, defaultValue, onChange, disabled, id, "aria-label": ariaLabel }) => {
  const options = collectOptions(children);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [internal, setInternal] = React.useState(String(defaultValue ?? options[0]?.value ?? ""));
  const current = value !== undefined ? String(value) : internal;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  // Keyboard-highlighted option (index into `filtered`); -1 when none.
  const [active, setActive] = React.useState(-1);
  const listboxId = React.useId();

  const { mounted: menuMounted, closing: menuClosing } = usePresence(open, 150);
  const showSearch = options.length > SEARCH_THRESHOLD;
  const filtered = query
    ? options.filter((o) => o.text.toLowerCase().includes(query.toLowerCase()))
    : options;

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!isInsidePopover(e.target, rootRef.current)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  React.useEffect(() => {
    if (open) {
      // Reset the query each open, seed the highlight on the current selection,
      // then focus search or scroll to selection.
      setQuery("");
      const sel = options.findIndex((o) => o.value === current);
      setActive(sel);
      if (showSearch) {
        searchRef.current?.focus();
      } else {
        listRef.current
          ?.querySelector("[data-selected=true]")
          ?.scrollIntoView({ block: "nearest" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showSearch]);

  // Keep the highlighted option scrolled into view as it moves.
  React.useEffect(() => {
    if (!open || active < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const selected = options.find((o) => o.value === current);

  function pick(v: string) {
    if (value === undefined) setInternal(v);
    onChange?.({ target: { value: v } } as unknown as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Move the highlight by `delta`, skipping disabled options and wrapping.
  function move(delta: number) {
    if (filtered.length === 0) return;
    setActive((a) => {
      let next = a;
      for (let step = 0; step < filtered.length; step++) {
        next = (next + delta + filtered.length) % filtered.length;
        if (!filtered[next]?.disabled) return next;
      }
      return a;
    });
  }

  // Shared keydown for the trigger and the search box.
  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!open) setOpen(true);
        else move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) setOpen(true);
        else move(-1);
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActive(filtered.findIndex((o) => !o.disabled));
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          for (let i = filtered.length - 1; i >= 0; i--)
            if (!filtered[i].disabled) {
              setActive(i);
              break;
            }
        }
        break;
      case "Enter":
      case " ":
        if (!open) {
          e.preventDefault();
          setOpen(true);
        } else if (active >= 0 && filtered[active] && !filtered[active].disabled) {
          e.preventDefault();
          pick(filtered[active].value);
        }
        break;
    }
  }

  const activeOptionId = open && active >= 0 ? `${listboxId}-opt-${active}` : undefined;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={showSearch ? undefined : activeOptionId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
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
      {menuMounted && (
        <PopoverLayer
          anchorRef={triggerRef}
          className={cn(
            "animate-dropdown min-w-max rounded-lg border border-border bg-surface p-1 shadow-pop",
            menuClosing && "animate-dropdown-out"
          )}
        >
          {showSearch && (
            <div className="relative mb-1 px-1 pt-1">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-light" />
              <input
                ref={searchRef}
                value={query}
                role="combobox"
                aria-expanded
                aria-controls={listboxId}
                aria-activedescendant={activeOptionId}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search…"
                className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </div>
          )}
          <div ref={listRef} id={listboxId} role="listbox" className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-2.5 py-2 text-sm text-muted-light">No matches</p>
            )}
            {filtered.map((o, i) => (
              <button
                key={o.value + i}
                id={`${listboxId}-opt-${i}`}
                type="button"
                role="option"
                aria-selected={o.value === current}
                data-index={i}
                disabled={o.disabled}
                data-selected={o.value === current}
                onClick={() => pick(o.value)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors cursor-pointer",
                  o.value === current
                    ? "bg-primary-soft font-medium text-primary"
                    : i === active
                      ? "bg-surface-hover"
                      : "hover:bg-surface-hover",
                  o.disabled && "opacity-50"
                )}
              >
                <span className="truncate">{o.label}</span>
                {o.value === current && <Check className="size-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        </PopoverLayer>
      )}
    </div>
  );
});
Select.displayName = "Select";

interface ComboOption {
  id: string;
  name: string;
}

/**
 * Search-or-create combobox. Behaves like a <select> whose current value is a
 * directory row id, submitted via a hidden input named `name`. Typing filters
 * the list; if nothing matches, an inline "Create «query»" row calls `onCreate`,
 * which resolves to the new row's id and selects it. Rendered as a portaled
 * popover so it can't be clipped by table/overflow containers.
 */
export function ComboBox({
  name,
  options,
  defaultValue,
  onCreate,
  freeText = false,
  placeholder = "Search or create…",
  createLabel = "Create",
  disabled,
  id,
  className,
}: {
  name: string;
  options: ComboOption[];
  defaultValue?: string;
  /**
   * Given the typed text, create the row and return its new id. In `freeText`
   * mode this is optional — "create" just commits the raw typed value.
   */
  onCreate?: (name: string) => Promise<string | null>;
  /**
   * When true, the submitted value IS the option name / typed text (not an id).
   * Used for free-text fields (e.g. airport codes) that aren't directory-backed.
   */
  freeText?: boolean;
  placeholder?: string;
  createLabel?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const [value, setValue] = React.useState(defaultValue ?? "");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [creating, setCreating] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();
  const { mounted, closing } = usePresence(open, 150);

  // In freeText mode the value matches an option by name; the label falls back
  // to the raw value so a typed-in code still shows even if it's not listed.
  const selected = freeText
    ? options.find((o) => o.id === value) ?? (value ? { id: value, name: value } : undefined)
    : options.find((o) => o.id === value);
  const q = query.trim();
  const filtered = q
    ? options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()))
    : options;
  const exact = options.some((o) => o.name.toLowerCase() === q.toLowerCase());
  const showCreate = q.length > 0 && !exact;

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!isInsidePopover(e.target, rootRef.current)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    // The popover mounts in a portal (positioned in a layout effect, starting
    // hidden), so the input isn't focusable on this tick. Focus on the next
    // frame; retry once more in case layout hasn't settled.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      if (searchRef.current) searchRef.current.focus();
      else raf2 = requestAnimationFrame(() => searchRef.current?.focus());
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(v: string) {
    setValue(v);
    setOpen(false);
    triggerRef.current?.focus();
  }

  async function create() {
    if (!q || creating) return;
    if (freeText && !onCreate) {
      // Nothing to persist — the typed text is itself the value.
      pick(q);
      return;
    }
    setCreating(true);
    const newId = await onCreate!(q);
    setCreating(false);
    if (newId) pick(newId);
  }

  // Number of selectable rows: filtered options plus an optional create row.
  const rowCount = filtered.length + (showCreate ? 1 : 0);

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!open) setOpen(true);
        else setActive((a) => Math.min(a + 1, rowCount - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) setActive((a) => Math.max(a - 1, 0));
        break;
      case "Enter":
        if (open) {
          e.preventDefault();
          if (showCreate && active === filtered.length) create();
          else if (filtered[active]) pick(filtered[active].id);
        }
        break;
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input type="hidden" name={name} value={value} />
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-foreground shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50 cursor-pointer",
          open && "ring-2 ring-[var(--ring)]"
        )}
      >
        <span className={cn("truncate text-left", !selected && "text-muted-light")}>
          {selected?.name ?? "—"}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-light transition-transform", open && "rotate-180")}
        />
      </button>
      {mounted && (
        <PopoverLayer
          anchorRef={triggerRef}
          className={cn(
            "animate-dropdown min-w-max rounded-lg border border-border bg-surface p-1 shadow-pop",
            closing && "animate-dropdown-out"
          )}
        >
          <div className="relative mb-1 px-1 pt-1">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-light" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </div>
          <div ref={listRef} id={listboxId} role="listbox" className="max-h-56 overflow-y-auto">
            {filtered.map((o, i) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={o.id === value}
                data-index={i}
                onClick={() => pick(o.id)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors cursor-pointer",
                  o.id === value
                    ? "bg-primary-soft font-medium text-primary"
                    : i === active
                      ? "bg-surface-hover"
                      : "hover:bg-surface-hover"
                )}
              >
                <span className="truncate">{o.name}</span>
                {o.id === value && <Check className="size-3.5 shrink-0" />}
              </button>
            ))}
            {showCreate && (
              <button
                type="button"
                data-index={filtered.length}
                onClick={create}
                onMouseEnter={() => setActive(filtered.length)}
                disabled={creating}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors cursor-pointer text-primary",
                  active === filtered.length ? "bg-surface-hover" : "hover:bg-surface-hover"
                )}
              >
                <Plus className="size-3.5 shrink-0" />
                <span className="truncate">
                  {createLabel} “{q}”
                </span>
              </button>
            )}
            {filtered.length === 0 && !showCreate && (
              <p className="px-2.5 py-2 text-sm text-muted-light">No matches</p>
            )}
          </div>
        </PopoverLayer>
      )}
    </div>
  );
}

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
  const generatedId = React.useId();
  // Associate the label with its control: clone the single child to give it an
  // id (unless it already has one), and point the label's htmlFor at it. Makes
  // clicking the label focus the field and screen readers announce its name.
  let control = children;
  let htmlFor: string | undefined;
  if (React.isValidElement(children)) {
    const childId = (children.props as { id?: string }).id;
    htmlFor = childId ?? generatedId;
    if (!childId) {
      control = React.cloneElement(children as React.ReactElement<{ id?: string }>, {
        id: generatedId,
      });
    }
  }
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {control}
    </div>
  );
}
