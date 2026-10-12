import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { createElement } from "react";
import { PDF_COLORS, PdfDocument, PdfSummary, PdfTable } from "@/shared/pdf/document";
import { renderPdf } from "@/shared/pdf/render";
import type { ReportPdfDocument } from "../application/ports";

// The printed report (design system 5.11, 5.18): A4 landscape on the shared base, with the summary
// tables and totals first, then one table whose last row holds the totals.
const styles = StyleSheet.create({
  totalsRow: {
    flexDirection: "row",
    borderTopWidth: 1.5,
    borderColor: PDF_COLORS.ink1,
    paddingVertical: 4,
    fontWeight: 600,
  },
  cell: { paddingRight: 6 },
});

function Report({ document }: { document: ReportPdfDocument }) {
  return (
    <PdfDocument
      documentTitle={document.title}
      clinicName={document.clinicName}
      logo={document.logo}
      title={document.title}
      subtitle={document.subtitle}
      footerNote={document.generated}
      pageLabel={document.pageLabel}
      orientation="landscape"
    >
      <PdfSummary
        blocks={[
          ...(document.totals.length > 0 ? [{ pairs: document.totals }] : []),
          ...document.summaries.map((summary) => ({
            title: summary.title,
            table: { columns: summary.columns, rows: summary.rows },
          })),
        ]}
      />
      <PdfTable columns={document.columns} rows={document.rows} emptyText={document.emptyText} />
      {document.totalsRow ? (
        <View style={styles.totalsRow} wrap={false}>
          {document.totalsRow.map((value, index) => (
            <Text key={index} style={[styles.cell, { width: document.columns[index]?.width ?? "auto" }]}>
              {value}
            </Text>
          ))}
        </View>
      ) : null}
    </PdfDocument>
  );
}

export function renderReport(document: ReportPdfDocument): Promise<Buffer> {
  return renderPdf(createElement(Report, { document }));
}
