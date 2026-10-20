import type { ExportPdf } from "../application/ports";

// The PDF engine is loaded only when a summary is rendered: the worker and CLI scripts (tsx, which
// loads the composition root) cannot resolve @react-pdf's package exports through a static import.
export const reactPdfExportSummary: ExportPdf = {
  async render(model) {
    const { renderExportSummary } = await import("./export-pdf-document");
    return renderExportSummary(model);
  },
};
