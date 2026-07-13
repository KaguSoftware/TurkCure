"use client";

import dynamic from "next/dynamic";

// TipTap/ProseMirror is a large bundle; load the editor only when it actually
// renders (e.g. the instructions tab is opened) instead of shipping it eagerly.
export const MarkdownEditor = dynamic(
  () => import("./markdown-editor-impl").then((m) => m.MarkdownEditor),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
        Loading editor…
      </div>
    ),
  }
);
