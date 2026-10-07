import type { DocumentPdfRenderer } from "../application/ports";

// The PDF engine is loaded only when a document is rendered: the worker and CLI scripts (tsx, which
// loads the composition root) cannot resolve @react-pdf's package exports through a static import.
export const reactPdfDocumentRenderer: DocumentPdfRenderer = {
  async render(input) {
    const { renderIssuedDocument } = await import("./document-pdf");
    return renderIssuedDocument(input);
  },
};
