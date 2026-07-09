"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  leaving?: boolean;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let listeners: Listener[] = [];
let nextId = 1;

function emit() {
  for (const l of listeners) l(toasts);
}

function remove(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function dismiss(id: number) {
  const t = toasts.find((t) => t.id === id);
  if (!t || t.leaving) return;
  toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => remove(id), 220);
}

function push(kind: ToastKind, message: string, duration = kind === "error" ? 6000 : 3500) {
  const id = nextId++;
  toasts = [...toasts, { id, kind, message }];
  emit();
  setTimeout(() => dismiss(id), duration);
  return id;
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
};

const KIND_STYLES: Record<ToastKind, { icon: React.ReactNode; bar: string }> = {
  success: { icon: <CheckCircle2 className="size-4 text-success" />, bar: "bg-success" },
  error: { icon: <AlertCircle className="size-4 text-danger" />, bar: "bg-danger" },
  info: { icon: <Info className="size-4 text-primary" />, bar: "bg-primary" },
};

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    const listener: Listener = (t) => setItems(t);
    listeners.push(listener);
    setItems(toasts);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-border bg-surface py-3 pl-4 pr-3 shadow-pop",
            t.leaving ? "toast-exit" : "toast-enter"
          )}
        >
          <span className={cn("absolute inset-y-0 left-0 w-1", KIND_STYLES[t.kind].bar)} />
          <span className="mt-0.5 shrink-0">{KIND_STYLES[t.kind].icon}</span>
          <p className="flex-1 text-sm text-foreground">{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="rounded-md p-1 text-muted-light hover:bg-surface-hover hover:text-foreground cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
