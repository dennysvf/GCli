import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { PdfDocument, PdfTable } from "@/shared/pdf/document";
import { renderPdf } from "@/shared/pdf/render";

describe("shared PDF base (ADR-024)", () => {
  it("renders a paginated document with the clinic header and a table", async () => {
    const rows = Array.from({ length: 80 }, (_, index) => [
      `${8 + (index % 10)}:00`,
      `Paciente ${index} – Conceição`,
    ]);
    const bytes = await renderPdf(
      createElement(
        PdfDocument,
        {
          documentTitle: "Teste",
          clinicName: "Clínica Exemplo",
          title: "Agenda de Dra. Ana",
          subtitle: "Unidade Centro · 06/10/2026",
          footerNote: "Gerado em 06/10/2026 08:00 por Recepção",
          pageLabel: "Página {page} de {total}",
        },
        createElement(PdfTable, {
          columns: [
            { label: "Horário", width: "20%" },
            { label: "Paciente", width: "80%" },
          ],
          rows,
          emptyText: "Nenhum agendamento.",
        }),
      ),
    );
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // 80 rows do not fit on one A4 page.
    expect(bytes.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThan(1);
  });
});
