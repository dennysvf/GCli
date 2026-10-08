import type { ReceiptRenderer } from "../application/ports";

// The PDF engine is loaded only when a receipt is rendered: the worker and CLI scripts (tsx, which
// loads the composition root) cannot resolve @react-pdf's package exports through a static import.
export const reactPdfReceiptRenderer: ReceiptRenderer = {
  async render(input) {
    const { renderReceipt } = await import("./receipt-pdf");
    return renderReceipt(input);
  },
};
