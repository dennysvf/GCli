import { describe, expect, it } from "vitest";
import { parseRichText, type RichNode } from "./rich-text-parse";

function names(nodes: RichNode[]): string[] {
  return nodes.map((node) => (typeof node === "string" ? node : node.tag));
}

function childrenOf(node: RichNode | undefined): RichNode[] {
  return node === undefined || typeof node === "string" ? [] : node.children;
}

describe("rich text for PDF", () => {
  it("F08: converts paragraphs, headings, lists and emphasis to PDF elements", () => {
    const tree = parseRichText(
      "<h2>Atestado</h2><p>Atesto que <strong>Ana</strong> e <em>Rita</em>.<br>Fim &amp; &lt;ok&gt;</p><ul><li>Um</li></ul><ol><li>Dois</li></ol>",
    );
    expect(names(tree)).toEqual(["h2", "p", "ul", "ol"]);
    expect(names(childrenOf(tree[1]))).toEqual([
      "Atesto que ",
      "strong",
      " e ",
      "em",
      ".",
      "br",
      "Fim & <ok>",
    ]);
  });

  it("F08: a typed entity is decoded once", () => {
    const tree = parseRichText("<p>&amp;lt;</p>");
    expect(childrenOf(tree[0])).toEqual(["&lt;"]);
  });

  it("F08: a stray closing tag is ignored and unknown tags keep their words", () => {
    const tree = parseRichText("<p>a</b>b<span>c</span></p>");
    expect(tree).toHaveLength(1);
    expect(names(childrenOf(tree[0]))).toEqual(["a", "b", "span"]);
  });
});
