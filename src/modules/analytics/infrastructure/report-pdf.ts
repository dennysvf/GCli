import type { ReportPdfRenderer } from "../application/ports";

// The PDF engine is loaded only when a report is rendered: the worker and CLI scripts (tsx, which
// loads the composition root) cannot resolve @react-pdf's package exports through a static import.
export const reactPdfReportRenderer: ReportPdfRenderer = {
  async render(document) {
    const { renderReport } = await import("./report-pdf-document");
    return renderReport(document);
  },
};
