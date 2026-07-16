import React from "react";
import { View, Text, Link, Image } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { parseMarkdown, type Block, type InlineNode } from "@/lib/markdown/parse";
import {
  BLUE,
  BLUE_DEEP,
  TEAL,
  INK,
  TEXT,
  HAIRLINE,
  CARD_BG,
  ACCENT_SOFT,
  TABLE_LINE,
  LABEL_BG,
  SERIF,
} from "@/lib/pdf/common";

/**
 * Renders instruction markdown into @react-pdf/renderer components using the
 * same parser as the in-app preview, so the PDF matches what the coordinator
 * saw. `scale` shrinks the whole block slightly for the combined case PDF.
 */

function InlineSpans({ nodes, scale }: { nodes: InlineNode[]; scale: number }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "text":
            return <Text key={i}>{n.text}</Text>;
          case "strong":
            return (
              <Text key={i} style={{ fontWeight: 700, color: INK }}>
                <InlineSpans nodes={n.children} scale={scale} />
              </Text>
            );
          case "em":
            return (
              <Text key={i} style={{ fontStyle: "italic" }}>
                <InlineSpans nodes={n.children} scale={scale} />
              </Text>
            );
          case "code":
            return (
              <Text
                key={i}
                style={{ fontFamily: "Courier", fontSize: 8.5 * scale, color: BLUE_DEEP }}
              >
                {n.text}
              </Text>
            );
          case "link":
            return (
              <Link key={i} src={n.href} style={{ color: BLUE, textDecoration: "underline" }}>
                <InlineSpans nodes={n.children} scale={scale} />
              </Link>
            );
          case "image":
            // Inline images inside text aren't supported by react-pdf; show the alt text.
            return <Text key={i}>{n.alt}</Text>;
        }
      })}
    </>
  );
}

/** Standalone images from a paragraph (react-pdf can't put <Image> inside <Text>). */
function blockImages(nodes: InlineNode[]): { src: string; alt: string }[] {
  return nodes.filter(
    (n): n is { type: "image"; src: string; alt: string } =>
      n.type === "image" && /^https?:\/\//.test(n.src)
  );
}

function BlockPdf({ block, scale }: { block: Block; scale: number }) {
  const base: Style = { fontSize: 10 * scale, lineHeight: 1.5, color: TEXT };

  switch (block.type) {
    case "heading": {
      const styles: Record<1 | 2 | 3, Style> = {
        1: { fontFamily: SERIF, fontWeight: 700, fontSize: 12.5 * scale, color: BLUE_DEEP },
        2: { fontFamily: SERIF, fontWeight: 700, fontSize: 11 * scale, color: BLUE_DEEP },
        3: { fontWeight: 600, fontSize: 10 * scale, color: INK },
      };
      return (
        <Text
          minPresenceAhead={30}
          style={[{ marginTop: 10 * scale, marginBottom: 4 * scale }, styles[block.level]]}
        >
          <InlineSpans nodes={block.children} scale={scale} />
        </Text>
      );
    }

    case "paragraph": {
      const images = blockImages(block.children);
      const textNodes = block.children.filter((n) => n.type !== "image");
      return (
        <View style={{ marginBottom: 4 * scale }}>
          {textNodes.length > 0 && (
            <Text style={base}>
              <InlineSpans nodes={textNodes} scale={scale} />
            </Text>
          )}
          {images.map((img, i) => (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image key={i} src={img.src} style={{ width: 200, marginTop: 6, marginBottom: 4 }} />
          ))}
        </View>
      );
    }

    case "list":
      return (
        <View style={{ marginBottom: 5 * scale }}>
          {block.items.map((item, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 2 * scale }}>
              <Text style={[base, { width: 16 * scale, textAlign: block.ordered ? "right" : "center" }]}>
                {block.ordered ? `${i + 1}.` : "•"}
              </Text>
              <Text style={[base, { flex: 1, paddingLeft: 5 * scale }]}>
                <InlineSpans nodes={item} scale={scale} />
              </Text>
            </View>
          ))}
        </View>
      );

    case "code":
      return (
        <View
          style={{
            backgroundColor: CARD_BG,
            borderWidth: 1,
            borderColor: HAIRLINE,
            borderRadius: 4,
            paddingVertical: 6,
            paddingHorizontal: 8,
            marginBottom: 6 * scale,
          }}
        >
          {/* Split per line — react-pdf collapses whitespace inside a single <Text>. */}
          {block.text.split("\n").map((line, i) => (
            <Text
              key={i}
              style={{ fontFamily: "Courier", fontSize: 8 * scale, color: INK, lineHeight: 1.4 }}
            >
              {line || " "}
            </Text>
          ))}
        </View>
      );

    case "blockquote":
      return (
        <View
          style={
            block.note
              ? {
                  borderLeftWidth: 2,
                  borderLeftColor: TEAL,
                  backgroundColor: ACCENT_SOFT,
                  borderRadius: 4,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  marginBottom: 6 * scale,
                }
              : {
                  borderLeftWidth: 2,
                  borderLeftColor: HAIRLINE,
                  paddingLeft: 8,
                  marginBottom: 6 * scale,
                }
          }
        >
          {block.children.map((b, i) => (
            <BlockPdf key={i} block={b} scale={scale} />
          ))}
        </View>
      );

    case "table": {
      const cellBase: Style = {
        flex: 1,
        paddingVertical: 4,
        paddingHorizontal: 6,
        fontSize: 9 * scale,
        borderRightWidth: 1,
        borderRightColor: TABLE_LINE,
      };
      return (
        <View
          style={{
            borderWidth: 1,
            borderColor: TABLE_LINE,
            borderRadius: 4,
            marginBottom: 6 * scale,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              backgroundColor: LABEL_BG,
              borderBottomWidth: 1,
              borderBottomColor: TABLE_LINE,
            }}
            wrap={false}
          >
            {block.header.map((cell, i) => (
              <Text
                key={i}
                style={[
                  cellBase,
                  { fontWeight: 600, color: INK },
                  i === block.header.length - 1 ? { borderRightWidth: 0 } : {},
                ]}
              >
                <InlineSpans nodes={cell} scale={scale} />
              </Text>
            ))}
          </View>
          {block.rows.map((row, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                borderBottomWidth: i === block.rows.length - 1 ? 0 : 1,
                borderBottomColor: TABLE_LINE,
              }}
              wrap={false}
            >
              {/* Pad short rows to the header width so columns stay aligned. */}
              {Array.from({ length: block.header.length }).map((_, j) => (
                <Text
                  key={j}
                  style={[
                    cellBase,
                    { color: TEXT },
                    j === block.header.length - 1 ? { borderRightWidth: 0 } : {},
                  ]}
                >
                  {row[j] ? <InlineSpans nodes={row[j]} scale={scale} /> : " "}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    }
  }
}

export function PdfMarkdown({ md, scale = 1 }: { md: string; scale?: number }) {
  const blocks = parseMarkdown(md ?? "");
  return (
    <View>
      {blocks.map((b, i) => (
        <BlockPdf key={i} block={b} scale={scale} />
      ))}
    </View>
  );
}
