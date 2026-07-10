"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Car, Hotel, Loader2, Search, Stethoscope, User } from "lucide-react";
import { globalSearch, type SearchResult } from "@/lib/actions/search";
import { cn } from "@/lib/utils";
import { usePresence } from "@/lib/use-presence";

const KIND_META: Record<SearchResult["kind"], { label: string; icon: typeof User }> = {
  patient: { label: "Patient", icon: User },
  hospital: { label: "Hospital", icon: Building2 },
  doctor: { label: "Doctor", icon: Stethoscope },
  hotel: { label: "Hotel", icon: Hotel },
  driver: { label: "Driver", icon: Car },
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [active, setActive] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const seq = React.useRef(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { mounted, closing } = usePresence(open, 180);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    // Reset on open (not close) so the content doesn't flash during the exit animation.
    setQuery("");
    setResults([]);
    setActive(0);
    // Focus after the dialog paints.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  React.useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setPending(false);
      return;
    }
    setPending(true);
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      const { results } = await globalSearch(query);
      if (seq.current !== mySeq) return; // stale response
      setResults(results);
      setActive(0);
      setPending(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function go(r: SearchResult) {
    setOpen(false);
    router.push(r.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  }

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh]">
      <div
        className={cn(
          "animate-overlay fixed inset-0 bg-black/40 backdrop-blur-[2px]",
          closing && "animate-overlay-out"
        )}
        onClick={() => setOpen(false)}
      />
      <div
        className={cn(
          "animate-pop relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-pop",
          closing && "animate-pop-out"
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          {pending ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-light" />
          ) : (
            <Search className="size-4 shrink-0 text-muted-light" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search patients, hospitals, doctors, hotels, drivers…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-light"
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">
            esc
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {query.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">
              Type at least 2 characters to search.
            </p>
          ) : results.length === 0 && !pending ? (
            <p className="px-3 py-6 text-center text-sm text-muted">No matches.</p>
          ) : (
            results.map((r, i) => {
              const meta = KIND_META[r.kind];
              const Icon = meta.icon;
              return (
                <button
                  key={`${r.kind}-${r.id}`}
                  onClick={() => go(r)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left cursor-pointer",
                    i === active ? "bg-primary-soft" : "hover:bg-surface-hover"
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-muted">{r.subtitle}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-light">
                    {meta.label}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/** Topbar trigger that looks like a search field and opens the palette via the same shortcut. */
export function SearchTrigger() {
  return (
    <button
      onClick={() =>
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })
        )
      }
      className="pressable hidden h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-light hover:border-border-strong sm:flex cursor-pointer"
    >
      <Search className="size-3.5" />
      <span className="text-xs">Search…</span>
      <kbd className="ml-4 rounded border border-border px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
    </button>
  );
}
