import { createElement } from "react";
import { PdfDocument, PdfTable } from "@/shared/pdf/document";
import { renderPdf } from "@/shared/pdf/render";
import type { DailyAgendaDocument } from "../application/ports";

// The printed daily agenda (design system 5.11): one table, ink only, on the shared PDF base.
const COLUMN_WIDTHS = ["12%", "22%", "14%", "16%", "9%", "11%", "16%"];

function DailyAgenda({ document }: { document: DailyAgendaDocument }) {
  return (
    <PdfDocument
      documentTitle={document.labels.title}
      clinicName={document.clinicName}
      logo={document.logo}
      title={document.labels.title}
      subtitle={document.labels.subtitle}
      footerNote={document.labels.generated}
      pageLabel={document.labels.page}
    >
      <PdfTable
        columns={document.labels.columns.map((label, index) => ({
          label,
          width: COLUMN_WIDTHS[index] ?? "10%",
        }))}
        rows={document.rows.map((row) => [
          row.time,
          row.patient,
          row.phone,
          row.service,
          row.room,
          row.status,
          row.notes,
        ])}
        emptyText={document.labels.empty}
      />
    </PdfDocument>
  );
}

export function renderDailyAgenda(document: DailyAgendaDocument): Promise<Buffer> {
  return renderPdf(createElement(DailyAgenda, { document }));
}
