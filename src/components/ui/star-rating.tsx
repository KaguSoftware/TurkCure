"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Clickable 1–5 star rating that submits like a form field via a hidden input.
 * Click a star to set the rating; click the same star again to clear it.
 */
export function StarRating({
  name,
  defaultValue = 0,
  max = 5,
}: {
  name: string;
  defaultValue?: number;
  max?: number;
}) {
  const [value, setValue] = React.useState(defaultValue);
  const [hover, setHover] = React.useState(0);
  const shown = hover || value;

  return (
    <div className="flex items-center gap-1">
      {name && <input type="hidden" name={name} value={value || ""} />}
      {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => setValue((v) => (v === star ? 0 : star))}
          className="rounded p-0.5 text-muted-light transition-colors hover:text-warning cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Star
            className={cn(
              "size-6 transition-colors",
              star <= shown ? "fill-warning text-warning" : "fill-transparent"
            )}
          />
        </button>
      ))}
      {value > 0 && (
        <button
          type="button"
          onClick={() => setValue(0)}
          className="ml-1 text-xs text-muted-light hover:text-foreground cursor-pointer"
        >
          Clear
        </button>
      )}
    </div>
  );
}
