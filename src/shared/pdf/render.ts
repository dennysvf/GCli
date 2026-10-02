import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { registerPdfFonts } from "./fonts";

type PdfElement = Parameters<typeof renderToBuffer>[0];

// Renders a document built with PdfDocument to the bytes of a PDF file (ADR-024).
export async function renderPdf(document: ReactElement): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(document as PdfElement);
}
