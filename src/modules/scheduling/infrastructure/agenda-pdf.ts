import type { AgendaPdfRenderer } from "../application/ports";

// The PDF engine is loaded only when a document is rendered: the worker and CLI scripts (tsx, which
// loads the composition root) cannot resolve @react-pdf's package exports through a static import.
export const reactPdfAgendaRenderer: AgendaPdfRenderer = {
  async render(document) {
    const { renderDailyAgenda } = await import("./agenda-pdf-document");
    return renderDailyAgenda(document);
  },
};
