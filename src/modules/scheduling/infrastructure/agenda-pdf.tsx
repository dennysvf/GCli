import { createElement } from "react";
import { PdfDocument, PdfTable } from "@/shared/pdf/document";
import { renderPdf } from "@/shared/pdf/render";
import type { AgendaPdfRenderer, DailyAgendaDocument } from "../application/ports";

// The printed daily agenda (design system 5.11): one table, ink only, on the shared PDF base.
const COLUMNS = [
  { label: "Horário", width: "12%" },
  { label: "Paciente", width: "22%" },
  { label: "Telefone", width: "14%" },
  { label: "Serviço", width: "16%" },
  { label: "Sala", width: "9%" },
  { label: "Status", width: "11%" },
  { label: "Observações", width: "16%" },
];

function DailyAgenda({ document }: { document: DailyAgendaDocument }) {
  return (
    <PdfDocument
      documentTitle={`Agenda de ${document.professionalName}`}
      clinicName={document.clinicName}
      logo={document.logo}
      title={`Agenda de ${document.professionalName}`}
      subtitle={`${document.unitName} · ${document.dateLabel} · ${document.rows.length} agendamentos`}
      footerNote={document.generatedLabel}
    >
      <PdfTable
        columns={COLUMNS}
        rows={document.rows.map((row) => [
          row.time,
          row.patient,
          row.phone,
          row.service,
          row.room,
          row.status,
          row.notes,
        ])}
        emptyText="Nenhum agendamento neste dia."
      />
    </PdfDocument>
  );
}

export const reactPdfAgendaRenderer: AgendaPdfRenderer = {
  render: (document) => renderPdf(createElement(DailyAgenda, { document })),
};
