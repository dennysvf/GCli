import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { createElement } from "react";
import { PDF_COLORS, PdfDocument, PdfSummary, PdfTable } from "@/shared/pdf/document";
import { renderPdf } from "@/shared/pdf/render";
import type { ExportPdfModel } from "../application/ports";

// resumo.pdf of an LGPD export (spec decision D20) on the shared base of ADR-024: A4 portrait, one
// titled section per kind of data. Tables wrap row by row, so long histories flow over pages.
const styles = StyleSheet.create({
  section: { marginBottom: 14 },
  heading: { fontWeight: 600, fontSize: 11, marginBottom: 6 },
  empty: { color: PDF_COLORS.ink2 },
  textBlock: { marginBottom: 8, paddingBottom: 6, borderBottomWidth: 0.5, borderColor: PDF_COLORS.rule },
  textHeading: { fontWeight: 600, marginBottom: 3 },
  textBody: { lineHeight: 1.4 },
});

function Section({ section }: { section: ExportPdfModel["sections"][number] }) {
  const isEmpty =
    !section.pairs?.length &&
    !section.table?.rows.length &&
    !section.texts?.length &&
    section.empty !== undefined;
  return (
    <View style={styles.section}>
      <Text style={styles.heading} minPresenceAhead={40}>
        {section.title}
      </Text>
      {section.pairs?.length ? <PdfSummary blocks={[{ pairs: section.pairs }]} /> : null}
      {section.table?.rows.length ? (
        <PdfTable columns={section.table.columns} rows={section.table.rows} emptyText="" />
      ) : null}
      {section.texts?.map((text, index) => (
        <View key={index} style={styles.textBlock}>
          <Text style={styles.textHeading}>{text.heading}</Text>
          <Text style={styles.textBody}>{text.body}</Text>
        </View>
      ))}
      {isEmpty ? <Text style={styles.empty}>{section.empty}</Text> : null}
    </View>
  );
}

function Summary({ model }: { model: ExportPdfModel }) {
  return (
    <PdfDocument
      documentTitle={model.documentTitle}
      clinicName={model.clinicName}
      logo={model.logo}
      title={model.title}
      subtitle={model.subtitle}
      footerNote={model.footer}
      pageLabel={model.pageLabel}
    >
      {model.sections.map((section, index) => (
        <Section key={index} section={section} />
      ))}
    </PdfDocument>
  );
}

export function renderExportSummary(model: ExportPdfModel): Promise<Buffer> {
  return renderPdf(createElement(Summary, { model }));
}
