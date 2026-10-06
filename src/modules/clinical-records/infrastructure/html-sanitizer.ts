import sanitizeHtml from "sanitize-html";
import type { HtmlSanitizer } from "../application/ports";

// The editor's allowlist (ADR-032): paragraphs, bold, italic, two heading levels and lists. No
// attributes, no links, no styles, no images. Headings deeper than the allowed ones become
// paragraphs, so pasted text keeps its words.
const ALLOWED_TAGS = ["p", "br", "strong", "em", "h2", "h3", "ul", "ol", "li"];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {},
  disallowedTagsMode: "discard",
  // Scripts and styles lose their content too; unknown inline tags keep their text.
  nonTextTags: ["script", "style", "textarea", "option", "noscript"],
  transformTags: {
    b: "strong",
    i: "em",
    h1: "h2",
    h4: "h3",
    h5: "h3",
    h6: "h3",
    div: "p",
  },
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

// Plain text of the sanitized HTML: block ends become line breaks so list items and paragraphs do
// not run together in previews and exports.
function toText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h2|h3|li)>/gi, "\n")
    .replace(/<li>/gi, "- ");
  const stripped = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  // One pass, so a typed "&lt;" is not decoded twice.
  const decoded = stripped.replace(
    /&(amp|lt|gt|quot|#39|nbsp);/g,
    (_match, entity: string) => ENTITIES[entity] ?? "",
  );
  return decoded.replace(/\n{3,}/g, "\n\n").trim();
}

export const sanitizeHtmlAdapter: HtmlSanitizer = {
  sanitize(html) {
    const clean = sanitizeHtml(html, OPTIONS);
    return { html: clean, text: toText(clean) };
  },
};
