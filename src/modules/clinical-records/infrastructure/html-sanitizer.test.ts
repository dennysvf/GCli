import { describe, expect, it } from "vitest";
import { sanitizeHtmlAdapter } from "./html-sanitizer";

describe("clinical note sanitizer", () => {
  it("F07: the sanitizer keeps only the allowed formatting", () => {
    const result = sanitizeHtmlAdapter.sanitize(
      '<h1>Título</h1><p style="color:red" onclick="x()">Texto <b>forte</b> <i>itálico</i> <a href="http://x">link</a></p>' +
        '<script>alert(1)</script><img src="x"><style>p{}</style><ul><li>Um</li><li>Dois</li></ul>',
    );
    expect(result.html).toBe(
      "<h2>Título</h2><p>Texto <strong>forte</strong> <em>itálico</em> link</p><ul><li>Um</li><li>Dois</li></ul>",
    );
    expect(result.html).not.toMatch(/script|onclick|style|href|<img/);
  });

  it("F07: the plain text keeps list items and paragraphs apart", () => {
    const result = sanitizeHtmlAdapter.sanitize("<p>Queixa</p><ul><li>Dor</li><li>Febre</li></ul><p>Fim</p>");
    expect(result.text).toBe("Queixa\n- Dor\n- Febre\nFim");
  });

  it("F07: typed markup characters are text, and are not decoded twice", () => {
    const result = sanitizeHtmlAdapter.sanitize("<p>PA &lt; 120 &amp; FC &amp;lt; 80</p>");
    expect(result.text).toBe("PA < 120 & FC &lt; 80");
  });

  it("F07: sanitizing is stable", () => {
    const once = sanitizeHtmlAdapter.sanitize("<p>a &amp; b</p>");
    expect(sanitizeHtmlAdapter.sanitize(once.html).html).toBe(once.html);
  });
});
