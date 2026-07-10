"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { parseMarkdown, type Block, type InlineNode } from "@/lib/markdown/parse";

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "text":
            return <React.Fragment key={i}>{n.text}</React.Fragment>;
          case "strong":
            return (
              <strong key={i} className="font-semibold text-foreground">
                <Inline nodes={n.children} />
              </strong>
            );
          case "em":
            return (
              <em key={i} className="italic">
                <Inline nodes={n.children} />
              </em>
            );
          case "code":
            return (
              <code
                key={i}
                className="rounded bg-surface-hover px-1 py-0.5 font-mono text-[0.85em] text-foreground"
              >
                {n.text}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={n.href}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2 hover:opacity-80"
              >
                <Inline nodes={n.children} />
              </a>
            );
          case "image":
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={n.src}
                alt={n.alt}
                className="my-2 max-h-48 max-w-full rounded-lg border border-border"
              />
            );
        }
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${block.level}`) as "h1" | "h2" | "h3";
      return (
        <Tag
          className={cn(
            "font-semibold text-foreground",
            block.level === 1 && "mt-4 text-lg first:mt-0",
            block.level === 2 && "mt-4 border-b border-border pb-1 text-base first:mt-0",
            block.level === 3 && "mt-3 text-sm first:mt-0"
          )}
        >
          <Inline nodes={block.children} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="text-sm leading-relaxed text-foreground">
          <Inline nodes={block.children} />
        </p>
      );
    case "list":
      return block.ordered ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline nodes={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline nodes={item} />
            </li>
          ))}
        </ul>
      );
    case "code":
      return (
        <pre className="overflow-x-auto whitespace-pre rounded-lg border border-border bg-surface-hover p-3 font-mono text-xs text-foreground">
          {block.text}
        </pre>
      );
    case "blockquote":
      return block.note ? (
        <div className="space-y-2 rounded-md border-l-2 border-info bg-info-soft px-3 py-2 text-info">
          {block.children.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      ) : (
        <blockquote className="space-y-2 border-l-2 border-border-strong pl-3 text-muted">
          {block.children.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </blockquote>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-border text-sm">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th
                    key={i}
                    className="border border-border bg-surface-hover px-2 py-1 text-left font-medium text-foreground"
                  >
                    <Inline nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="border border-border px-2 py-1 text-foreground">
                      <Inline nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Renders instruction markdown with the site theme — same AST as the PDF. */
export function MarkdownPreview({ source, className }: { source: string; className?: string }) {
  const blocks = React.useMemo(() => parseMarkdown(source), [source]);
  if (blocks.length === 0) {
    return <p className={cn("text-sm text-muted-light", className)}>Nothing to preview</p>;
  }
  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}
