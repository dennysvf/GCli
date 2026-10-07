import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { PDF_FONTS } from "./fonts";
import { parseRichText, type RichNode } from "./rich-text-parse";

// Turns the sanitized HTML subset of ADR-032 (p, br, strong, em, h2, h3, ul, ol, li) into PDF
// elements, so a document template renders in the shared page of ADR-024 (F08, ADR-033).

const styles = StyleSheet.create({
  paragraph: { marginBottom: 6, lineHeight: 1.4 },
  heading2: { fontFamily: PDF_FONTS.sans, fontWeight: 600, fontSize: 12, marginTop: 6, marginBottom: 4 },
  heading3: { fontFamily: PDF_FONTS.sans, fontWeight: 600, fontSize: 10.5, marginTop: 4, marginBottom: 3 },
  strong: { fontWeight: 600 },
  em: { fontStyle: "italic" },
  list: { marginBottom: 6 },
  item: { flexDirection: "row", marginBottom: 2 },
  marker: { width: 14 },
  itemText: { flex: 1, lineHeight: 1.4 },
});

function inline(nodes: RichNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (typeof node === "string") return node;
    if (node.tag === "br") return "\n";
    if (node.tag === "strong") {
      return (
        <Text key={index} style={styles.strong}>
          {inline(node.children)}
        </Text>
      );
    }
    if (node.tag === "em") {
      return (
        <Text key={index} style={styles.em}>
          {inline(node.children)}
        </Text>
      );
    }
    // Unknown inline tags keep their words.
    return <Text key={index}>{inline(node.children)}</Text>;
  });
}

function blocks(nodes: RichNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (typeof node === "string") {
      // Whitespace between blocks is not content.
      return node.trim() ? (
        <Text key={index} style={styles.paragraph}>
          {node}
        </Text>
      ) : null;
    }
    switch (node.tag) {
      case "h2":
        return (
          <Text key={index} style={styles.heading2}>
            {inline(node.children)}
          </Text>
        );
      case "h3":
        return (
          <Text key={index} style={styles.heading3}>
            {inline(node.children)}
          </Text>
        );
      case "ul":
      case "ol": {
        const items = node.children.filter(
          (child): child is { tag: string; children: RichNode[] } => typeof child !== "string",
        );
        return (
          <View key={index} style={styles.list}>
            {items.map((item, position) => (
              <View key={position} style={styles.item} wrap={false}>
                <Text style={styles.marker}>{node.tag === "ol" ? `${position + 1}.` : "•"}</Text>
                <Text style={styles.itemText}>{inline(item.children)}</Text>
              </View>
            ))}
          </View>
        );
      }
      case "p":
        // An empty paragraph is a blank line the writer left on purpose.
        return (
          <Text key={index} style={styles.paragraph}>
            {node.children.length > 0 ? inline(node.children) : " "}
          </Text>
        );
      default:
        return (
          <Text key={index} style={styles.paragraph}>
            {inline([node])}
          </Text>
        );
    }
  });
}

export function PdfRichText({ html }: { html: string }) {
  return <View>{blocks(parseRichText(html))}</View>;
}
