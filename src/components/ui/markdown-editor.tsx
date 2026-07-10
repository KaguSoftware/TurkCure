"use client";

import * as React from "react";
import {
  Bold,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Info,
  Italic,
  Link as LinkIcon,
  List,
  Table as TableIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownPreview } from "@/components/ui/markdown-preview";

/**
 * GitHub-style markdown editor: WRITE / PREVIEW tabs plus a formatting
 * toolbar that inserts markdown around the textarea selection. The PREVIEW
 * tab uses the same parser as the PDF renderer, so it is a faithful preview
 * of the generated document.
 */

type EditResult = { value: string; selStart: number; selEnd: number };

/** Wrap the selection in `marker`, or unwrap if already wrapped; empty selection inserts a placeholder. */
function wrapInline(
  value: string,
  start: number,
  end: number,
  marker: string,
  placeholder: string
): EditResult {
  const sel = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const m = marker.length;
  // Toggle off when the selection is already wrapped (inside or including the markers).
  if (sel.startsWith(marker) && sel.endsWith(marker) && sel.length >= 2 * m) {
    const inner = sel.slice(m, sel.length - m);
    return { value: before + inner + after, selStart: start, selEnd: start + inner.length };
  }
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      value: before.slice(0, -m) + sel + after.slice(m),
      selStart: start - m,
      selEnd: end - m,
    };
  }
  const inner = sel || placeholder;
  return {
    value: before + marker + inner + marker + after,
    selStart: start + m,
    selEnd: start + m + inner.length,
  };
}

/** Toggle a prefix on every line touched by the selection. */
function toggleLinePrefix(value: string, start: number, end: number, prefix: string): EditResult {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = value.length;
  const chunk = value.slice(lineStart, lineEnd);
  const lines = chunk.split("\n");
  const allPrefixed = lines.every((l) => l.startsWith(prefix) || l.trim() === "");
  const next = lines
    .map((l) => {
      if (l.trim() === "") return l;
      return allPrefixed ? l.slice(prefix.length) : prefix + l.replace(/^(#{1,6}|>|[-*])\s+/, "");
    })
    .join("\n");
  const newValue = value.slice(0, lineStart) + next + value.slice(lineEnd);
  return { value: newValue, selStart: lineStart, selEnd: lineStart + next.length };
}

/** Insert a block snippet on its own lines, padded with blank lines as needed. */
function insertBlock(
  value: string,
  start: number,
  end: number,
  snippet: string,
  cursorOffset?: number
): EditResult {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const pre = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const post = after === "" || after.startsWith("\n") ? "\n" : "\n\n";
  const inserted = pre + snippet + post;
  const cursor =
    start + pre.length + (cursorOffset !== undefined ? cursorOffset : snippet.length);
  return { value: before + inserted + after, selStart: cursor, selEnd: cursor };
}

const TABLE_SNIPPET = "| Column | Column |\n| --- | --- |\n| Cell | Cell |\n| Cell | Cell |";

type ActionId = "bold" | "italic" | "h2" | "h3" | "link" | "image" | "list" | "note" | "table";

const ACTIONS: Record<ActionId, (v: string, s: number, e: number) => EditResult> = {
  bold: (v, s, e) => wrapInline(v, s, e, "**", "bold text"),
  italic: (v, s, e) => wrapInline(v, s, e, "*", "italic text"),
  h2: (v, s, e) => toggleLinePrefix(v, s, e, "## "),
  h3: (v, s, e) => toggleLinePrefix(v, s, e, "### "),
  link: (v, s, e) => {
    const sel = v.slice(s, e);
    const text = sel || "text";
    // Select "url" so the user can type over it immediately.
    const urlStart = s + 1 + text.length + 2;
    return {
      value: v.slice(0, s) + `[${text}](url)` + v.slice(e),
      selStart: urlStart,
      selEnd: urlStart + 3,
    };
  },
  image: (v, s, e) => {
    const sel = v.slice(s, e);
    const alt = sel || "alt";
    const urlStart = s + 2 + alt.length + 2;
    return {
      value: v.slice(0, s) + `![${alt}](url)` + v.slice(e),
      selStart: urlStart,
      selEnd: urlStart + 3,
    };
  },
  list: (v, s, e) => toggleLinePrefix(v, s, e, "- "),
  note: (v, s, e) => {
    const sel = v.slice(s, e);
    if (sel) return toggleLinePrefix(v, s, e, "> ");
    const snippet = "> **Note:** ";
    return insertBlock(v, s, e, snippet, snippet.length);
  },
  table: (v, s, e) => insertBlock(v, s, e, TABLE_SNIPPET),
};

const TOOLBAR: { icon: React.ReactNode; label: string; id: ActionId; group?: boolean }[] = [
  { icon: <Bold />, label: "Bold (Ctrl+B)", id: "bold" },
  { icon: <Italic />, label: "Italic (Ctrl+I)", id: "italic" },
  { icon: <Heading2 />, label: "Heading 2", id: "h2", group: true },
  { icon: <Heading3 />, label: "Heading 3", id: "h3" },
  { icon: <LinkIcon />, label: "Link (Ctrl+K)", id: "link", group: true },
  { icon: <List />, label: "Bullet list", id: "list" },
  { icon: <Info />, label: "Note", id: "note" },
  { icon: <TableIcon />, label: "Table", id: "table" },
  { icon: <ImageIcon />, label: "Image", id: "image" },
];

export function MarkdownEditor({
  value,
  onChange,
  rows = 12,
  placeholder,
  className,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  /** Optional form field name — renders a hidden input for uncontrolled form posts. */
  name?: string;
}) {
  const [tab, setTab] = React.useState<"write" | "preview">("write");
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const pendingSel = React.useRef<{ start: number; end: number } | null>(null);

  React.useLayoutEffect(() => {
    if (pendingSel.current && taRef.current) {
      const { start, end } = pendingSel.current;
      pendingSel.current = null;
      taRef.current.focus();
      taRef.current.setSelectionRange(start, end);
    }
  });

  function runAction(id: ActionId) {
    const ta = taRef.current;
    if (!ta) return;
    const r = ACTIONS[id](ta.value, ta.selectionStart, ta.selectionEnd);
    pendingSel.current = { start: r.selStart, end: r.selEnd };
    onChange(r.value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "b" || key === "i" || key === "k") {
      e.preventDefault();
      runAction(key === "b" ? "bold" : key === "i" ? "italic" : "link");
    }
  }

  const minHeight = rows * 20 + 16;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface shadow-card transition-shadow focus-within:ring-2 focus-within:ring-[var(--ring)]",
        className
      )}
    >
      {name && <input type="hidden" name={name} value={value} />}
      <div className="flex items-center justify-between gap-2 rounded-t-lg border-b border-border bg-surface-hover px-2 pt-1.5">
        <div className="flex">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px rounded-t-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors cursor-pointer",
                tab === t
                  ? "border border-border border-b-transparent bg-surface text-foreground"
                  : "text-muted hover:text-foreground"
              )}
            >
              {t === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        <div
          className={cn(
            "flex items-center gap-0.5 pb-1.5",
            tab === "preview" && "pointer-events-none opacity-0"
          )}
        >
          {TOOLBAR.map((b, i) => (
            <React.Fragment key={b.label}>
              {b.group && i > 0 && <span className="mx-1 h-4 w-px bg-border" />}
              <button
                type="button"
                title={b.label}
                aria-label={b.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runAction(b.id)}
                className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground cursor-pointer [&_svg]:size-4"
              >
                {b.icon}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
      {tab === "write" ? (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={rows}
          placeholder={placeholder}
          className="block w-full resize-y rounded-b-lg bg-transparent px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-light focus-visible:outline-none"
        />
      ) : (
        <div className="overflow-y-auto px-3 py-2" style={{ minHeight, maxHeight: 480 }}>
          <MarkdownPreview source={value} />
        </div>
      )}
    </div>
  );
}
