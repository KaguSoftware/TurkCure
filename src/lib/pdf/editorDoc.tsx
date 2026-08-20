// Editor document → react-pdf mapper. Walks the Tiptap JSON produced by the
// case document editor (shape defined in src/lib/documents/blocks.ts — this
// module never imports Tiptap) and renders it through the SAME primitives the
// generated PDF uses, so an edited document and a generated one stay one design
// system.
//
// Resilience contract: NEVER throw mid-render. An unknown node type degrades to
// its plain-text content; a malformed known node is skipped with a faint
// placeholder so the surrounding document still renders and exports. A document
// that fails to render is a document that cannot be sent.

import React from "react";
import { View, Text, Image } from "@react-pdf/renderer";
import {
  MUTED,
  INK,
  TEXT,
  TABLE_LINE,
  TableSection,
  TRow,
  usePdfTheme,
} from "./common";
import { PdfMarkdown } from "./markdown";
import {
  BLOCK,
  plainText,
  type DocNode,
  type EditorDocJSON,
  type TableSectionAttrs,
  type PackageBulletsAttrs,
  type PaymentSummaryAttrs,
  type AdditionalCostsAttrs,
  type CompanyCardAttrs,
  type ConfirmationBlockAttrs,
  type InstructionBlockAttrs,
  type ImageAttrs,
  type TRowItem,
} from "@/lib/documents/blocks";

/** A4 content column: 595pt page − 2×50pt horizontal padding (pdfStyles.page). */
const CONTENT_WIDTH = 495;

const warnDev = (msg: string, node: DocNode) => {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[pdf/editorDoc] ${msg}`, node.type, node.attrs);
  }
};

/** Visible marker for a block whose data was lost — silence would hide it. */
const FaultyBlock = () => (
  <Text style={{ fontSize: 8, color: MUTED, marginBottom: 8 }}>[Block could not be rendered]</Text>
);

/** Inline text runs with bold/underline marks. Italic renders as regular — no
 *  italic face is registered, which is why the editor disables it outright. */
function InlineRuns({ nodes }: { nodes: DocNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.type === BLOCK.hardBreak) return <Text key={i}>{"\n"}</Text>;
        if (n.type === BLOCK.text) {
          let bold = false;
          let underline = false;
          for (const m of n.marks ?? []) {
            if (m.type === "bold") bold = true;
            if (m.type === "underline") underline = true;
          }
          if (!bold && !underline) return <Text key={i}>{n.text ?? ""}</Text>;
          return (
            <Text
              key={i}
              style={{
                ...(bold ? { fontWeight: 700 } : {}),
                ...(underline ? { textDecoration: "underline" } : {}),
              }}
            >
              {n.text ?? ""}
            </Text>
          );
        }
        return <Text key={i}>{plainText(n)}</Text>;
      })}
    </>
  );
}

/** Inline runs of block children (paragraphs in a cell), newline-separated. */
function BlockInline({ blocks }: { blocks: DocNode[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <Text key={i}>
          {i > 0 ? "\n" : null}
          <InlineRuns nodes={b.content ?? []} />
        </Text>
      ))}
    </>
  );
}

/** Rows for the label/value sections. Tolerates a non-array `rows`. */
function rowsOf(value: unknown): TRowItem[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((r) => {
    const row = (r ?? {}) as Partial<TRowItem>;
    return { label: String(row.label ?? ""), value: String(row.value ?? "") };
  });
}

function ListBlock({ node, ordered }: { node: DocNode; ordered: boolean }) {
  const { theme } = usePdfTheme();
  const items = node.content ?? [];
  return (
    <View style={{ marginBottom: 10 }}>
      {items.map((li, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: 3 }} wrap={false}>
          <Text style={{ width: 16, color: theme.coverAccent }}>{ordered ? `${i + 1}.` : "•"}</Text>
          <View style={{ flex: 1 }}>
            {(li.content ?? []).map((child, j) => (
              <BlockNode key={j} node={child} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function TableBlock({ node }: { node: DocNode }) {
  const { theme } = usePdfTheme();
  const rows = (node.content ?? []).filter((r) => r.type === BLOCK.tableRow);
  if (rows.length === 0) return null;
  // Precompute header/zebra metadata (no mutation inside the JSX map).
  const meta: { cells: DocNode[]; isHeader: boolean; zebra: boolean }[] = [];
  let bodyIndex = 0;
  for (const row of rows) {
    const cells = row.content ?? [];
    const isHeader = cells.length > 0 && cells.every((c) => c.type === BLOCK.tableHeader);
    if (!isHeader) bodyIndex += 1;
    meta.push({ cells, isHeader, zebra: !isHeader && bodyIndex % 2 === 0 });
  }
  return (
    <View style={{ marginBottom: 14, borderWidth: 1, borderColor: TABLE_LINE, borderRadius: 4 }}>
      {meta.map(({ cells, isHeader, zebra }, r) => (
        <View
          key={r}
          style={{
            flexDirection: "row",
            ...(isHeader ? { backgroundColor: theme.coverBg } : {}),
            ...(zebra ? { backgroundColor: "#fafaf7" } : {}),
            ...(r === 0 ? {} : { borderTopWidth: 1, borderTopColor: TABLE_LINE }),
          }}
          wrap={false}
        >
          {cells.map((cell, c) => {
            const span = Number((cell.attrs as { colspan?: number } | undefined)?.colspan ?? 1) || 1;
            return (
              <View key={c} style={{ flex: span, paddingVertical: 6, paddingHorizontal: 9 }}>
                <Text
                  style={
                    isHeader
                      ? {
                          fontSize: 7.5,
                          fontWeight: 700,
                          color: "#ffffff",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }
                      : { fontSize: 9.5, color: TEXT }
                  }
                >
                  <BlockInline blocks={cell.content ?? []} />
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function ImageBlock({ node }: { node: DocNode }) {
  const attrs = (node.attrs ?? {}) as Partial<ImageAttrs>;
  if (!attrs.src || typeof attrs.src !== "string") {
    warnDev("image without src skipped", node);
    return null;
  }
  // Natural px dims captured at insert time let us size without react-pdf
  // having to measure; CSS px → pt is ×0.75.
  let width = CONTENT_WIDTH;
  let height: number | undefined;
  if (attrs.width && attrs.height && attrs.width > 0 && attrs.height > 0) {
    width = Math.min(attrs.width * 0.75, CONTENT_WIDTH);
    height = (attrs.height / attrs.width) * width;
  }
  return (
    <View style={{ marginBottom: 12 }} wrap={false}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={attrs.src} style={{ width, ...(height ? { height } : {}) }} />
    </View>
  );
}

const HEADING_SIZE: Record<number, number> = { 2: 13, 3: 11 };

/** One block node. A single switch in a try/catch — no generic walker: each
 *  case decides whether and how to recurse. */
function BlockNode({ node }: { node: DocNode }): React.ReactElement | null {
  const { theme, styles: s } = usePdfTheme();
  try {
    switch (node.type) {
      case BLOCK.paragraph: {
        const kids = node.content ?? [];
        if (kids.length === 0) return <View style={{ height: 8 }} />;
        return (
          <Text style={{ marginBottom: 8, lineHeight: 1.5, color: TEXT }}>
            <InlineRuns nodes={kids} />
          </Text>
        );
      }

      case BLOCK.heading: {
        const level = Number((node.attrs as { level?: number } | undefined)?.level ?? 2);
        return (
          <Text
            style={{ ...s.instrHeading, fontSize: HEADING_SIZE[level] ?? 11 }}
            minPresenceAhead={40}
          >
            <InlineRuns nodes={node.content ?? []} />
          </Text>
        );
      }

      case BLOCK.bulletList:
        return <ListBlock node={node} ordered={false} />;
      case BLOCK.orderedList:
        return <ListBlock node={node} ordered />;
      case BLOCK.table:
        return <TableBlock node={node} />;
      case BLOCK.image:
        return <ImageBlock node={node} />;

      case BLOCK.pageBreak:
        return <View break />;

      case BLOCK.tableSection: {
        const a = node.attrs as TableSectionAttrs | undefined;
        const rows = rowsOf(a?.rows);
        if (!rows) {
          warnDev("tableSection without rows skipped", node);
          return <FaultyBlock />;
        }
        return (
          <TableSection number={a?.number} title={String(a?.title ?? "")} wrap={false}>
            {rows.map((r, i) => (
              <TRow key={i} label={r.label} value={r.value} last={i === rows.length - 1} />
            ))}
          </TableSection>
        );
      }

      case BLOCK.packageBullets: {
        const a = node.attrs as PackageBulletsAttrs | undefined;
        const bullets = Array.isArray(a?.bullets) ? a.bullets.map(String) : null;
        if (!bullets) {
          warnDev("packageBullets without bullets skipped", node);
          return <FaultyBlock />;
        }
        return (
          <TableSection number={a?.number} title={String(a?.title ?? "")} wrap={false}>
            <View style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
              <Text style={{ fontWeight: 700, color: INK, marginBottom: 8, fontSize: 10.5 }}>
                Procedure: {a?.procedure || "Treatment package"}
              </Text>
              {/* Two explicit columns, NOT one `flexWrap: "wrap"` row: react-pdf
                  under-measures a wrapped flex container (it reports roughly one
                  row's height), which made these bullets spill out of the card
                  and collide with the section below. */}
              <View style={{ flexDirection: "row" }}>
                {[0, 1].map((col) => (
                  <View key={col} style={{ width: "50%", paddingRight: 12 }}>
                    {bullets
                      .filter((_, i) => i % 2 === col)
                      .map((b, i) => (
                        <Text key={i} style={{ color: TEXT, lineHeight: 1.4, marginBottom: 4 }}>
                          <Text style={{ color: theme.coverAccent }}>• </Text>
                          {b}
                        </Text>
                      ))}
                  </View>
                ))}
              </View>
            </View>
          </TableSection>
        );
      }

      case BLOCK.paymentSummary: {
        const a = node.attrs as PaymentSummaryAttrs | undefined;
        const rows = rowsOf(a?.rows);
        if (!rows) {
          warnDev("paymentSummary without rows skipped", node);
          return <FaultyBlock />;
        }
        return (
          <>
            <TableSection number={a?.number} title={String(a?.title ?? "")} wrap={false}>
              {rows.map((r, i) => (
                <TRow key={i} label={r.label} value={r.value} />
              ))}
              <View style={[s.tRowLast, { backgroundColor: theme.coverSoftBg }]}>
                <Text style={[s.tLabel, { backgroundColor: "transparent", color: theme.coverAccentDark }]}>
                  {a?.balanceLabel ?? "Remaining balance"}
                </Text>
                <Text style={[s.tValue, { fontSize: 12, fontWeight: 700, color: theme.coverBg }]}>
                  {a?.balanceValue ?? "—"}
                </Text>
              </View>
            </TableSection>
            {a?.note ? <SectionNote>{a.note}</SectionNote> : null}
          </>
        );
      }

      case BLOCK.additionalCosts: {
        const a = node.attrs as AdditionalCostsAttrs | undefined;
        if (!Array.isArray(a?.rows)) {
          warnDev("additionalCosts without rows skipped", node);
          return <FaultyBlock />;
        }
        // An emptied list is a deliberate edit, not an error: drop the section.
        if (a.rows.length === 0) return null;
        return (
          <>
            <TableSection number={a.number} title={String(a.title ?? "")} wrap={false}>
              {a.rows.map((r, i) => (
                <TRow
                  key={i}
                  label={String(r?.title ?? "") || "—"}
                  value={String(r?.amount ?? "")}
                  last={i === a.rows.length - 1}
                />
              ))}
            </TableSection>
            {/* Load-bearing: without it a patient reading a total immediately
                followed by more prices assumes the total includes them. */}
            {a.note ? <SectionNote>{a.note}</SectionNote> : null}
          </>
        );
      }

      case BLOCK.companyCard: {
        const a = node.attrs as CompanyCardAttrs | undefined;
        const rows = rowsOf(a?.rows);
        if (!rows) {
          warnDev("companyCard without rows skipped", node);
          return <FaultyBlock />;
        }
        return (
          <View style={{ marginTop: 20 }}>
            <TableSection number={a?.number} title={String(a?.title ?? "")} wrap={false}>
              {rows.map((r, i) => (
                <TRow key={i} label={r.label} value={r.value} last={i === rows.length - 1} />
              ))}
            </TableSection>
          </View>
        );
      }

      case BLOCK.confirmationBlock: {
        const a = node.attrs as ConfirmationBlockAttrs | undefined;
        const signers = Array.isArray(a?.signers) ? a.signers.map(String) : ["Patient Signature", "Date"];
        return (
          <View wrap={false} style={{ marginTop: 4 }}>
            <Text style={s.instrHeading}>{a?.title ?? "Confirmation"}</Text>
            <Text style={{ marginBottom: 26, lineHeight: 1.5, color: TEXT }}>{a?.body ?? ""}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 34 }}>
              {signers.map((label, i) => (
                <View key={i} style={{ flex: 1 }}>
                  <View style={{ borderTopWidth: 1, borderTopColor: TABLE_LINE, marginBottom: 5 }} />
                  <Text style={{ color: MUTED, fontSize: 8.5 }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      }

      case BLOCK.instructionBlock: {
        const a = node.attrs as InstructionBlockAttrs | undefined;
        const urls = Array.isArray(a?.imageUrls) ? a.imageUrls.filter(Boolean) : [];
        return (
          <View>
            {a?.title ? (
              <Text style={s.instrHeading} minPresenceAhead={40}>
                {a.title}
              </Text>
            ) : null}
            <PdfMarkdown md={a?.bodyMd ?? ""} scale={0.95} />
            {urls.length > 0 && (
              <View
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}
                wrap={false}
              >
                {urls.map((u, k) => (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image key={k} src={u} style={{ width: 150, marginBottom: 6 }} />
                ))}
              </View>
            )}
          </View>
        );
      }

      // The cover is a whole Page and cannot appear inside the body flow; the
      // route renders it separately from the same attrs.
      case BLOCK.coverBlock:
        return null;

      default: {
        // Unknown node: degrade to its text content, never crash the render.
        warnDev("unknown node rendered as plain text", node);
        const t = plainText(node);
        return t ? <Text style={{ marginBottom: 8, color: TEXT }}>{t}</Text> : null;
      }
    }
  } catch {
    warnDev("node failed to render", node);
    return <FaultyBlock />;
  }
}

/** The small muted line that sits under a section (payment method, etc.). */
function SectionNote({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 8.5, marginTop: -12, marginBottom: 20, color: MUTED }}>{children}</Text>
  );
}

/**
 * Returns a FRAGMENT, not a wrapping <View>: react-pdf honors the `break` prop
 * only on direct children of <Page> — nested inside any View it is silently
 * ignored and the subtree can even be dropped. Keeping blocks as direct Page
 * children is what makes the pageBreak node work.
 */
export function EditorDocBody({ doc }: { doc: EditorDocJSON }) {
  const content = Array.isArray(doc?.content) ? doc.content : [];
  return (
    <>
      {content.map((node, i) => (
        <BlockNode key={i} node={node} />
      ))}
    </>
  );
}

/** Pulls the cover attrs out of a document so the route can render the cover
 *  Page from the same edited values. Null when the document has no cover. */
export function findCoverAttrs(doc: EditorDocJSON): Record<string, unknown> | null {
  const node = (doc?.content ?? []).find((n) => n.type === BLOCK.coverBlock);
  return node?.attrs ?? null;
}
