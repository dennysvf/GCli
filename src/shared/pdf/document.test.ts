import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { PdfDocument, PdfSummary, PdfTable } from "./document";
import { renderPdf } from "./render";

// MediaBox of the first page, read from the raw PDF bytes (width, height).
function firstPageSize(bytes: Buffer): [number, number] {
  const match = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(bytes.toString("latin1"));
  return [Number(match?.[1]), Number(match?.[2])];
}

function document(orientation?: "portrait" | "landscape") {
  return createElement(
    PdfDocument,
    {
      documentTitle: "t",
      clinicName: "Clinic",
      title: "Title",
      footerNote: "note",
      pageLabel: "{page}/{total}",
      orientation,
    },
    createElement(PdfSummary, { blocks: [{ pairs: [{ label: "Rows", value: "1" }] }] }),
    createElement(PdfTable, { columns: [{ label: "A", width: "100%" }], rows: [["x"]], emptyText: "" }),
  );
}

describe("shared PDF base", () => {
  it("F13: landscape documents render on an A4 landscape page", async () => {
    const [width, height] = firstPageSize(await renderPdf(document("landscape")));
    expect(width).toBeGreaterThan(height);
  });

  it("F06: portrait remains the default orientation", async () => {
    const [width, height] = firstPageSize(await renderPdf(document()));
    expect(width).toBeLessThan(height);
  });
});
