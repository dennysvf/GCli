// Parser of the sanitized HTML subset of ADR-032 (p, br, strong, em, h2, h3, ul, ol, li), shared
// by the PDF converter and its tests. The input is always the output of the sanitizer, so the markup
// is well formed and has no attributes. It has no React import, so unit tests can load it.

export type RichNode = { tag: string; children: RichNode[] } | string;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

function decode(text: string): string {
  // One pass, so a typed "&lt;" is not decoded twice.
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_match, entity: string) => ENTITIES[entity] ?? "");
}

const VOID_TAGS = new Set(["br"]);

export function parseRichText(html: string): RichNode[] {
  const root: { tag: string; children: RichNode[] } = { tag: "root", children: [] };
  const stack = [root];
  const token = /<(\/?)([a-z0-9]+)\s*\/?>|([^<]+)/gi;
  for (const match of html.matchAll(token)) {
    const current = stack[stack.length - 1] ?? root;
    const [, closing, tag, text] = match;
    if (text !== undefined) {
      current.children.push(decode(text));
    } else if (tag && VOID_TAGS.has(tag.toLowerCase())) {
      current.children.push({ tag: "br", children: [] });
    } else if (tag && closing) {
      // Closes the nearest open element with this name; a stray closing tag is ignored.
      const index = stack.map((node) => node.tag).lastIndexOf(tag.toLowerCase());
      if (index > 0) stack.length = index;
    } else if (tag) {
      const node = { tag: tag.toLowerCase(), children: [] as RichNode[] };
      current.children.push(node);
      stack.push(node);
    }
  }
  return root.children;
}
