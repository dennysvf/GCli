import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { createElement } from "react";
import { PdfDocument, PDF_COLORS } from "@/shared/pdf/document";
import { PDF_FONTS } from "@/shared/pdf/fonts";
import { PdfRichText } from "@/shared/pdf/rich-text";
import { renderPdf } from "@/shared/pdf/render";
import type { DocumentPdfInput } from "../application/ports";

// The issued document (PRD F08): A4 on the shared page of ADR-024 (logo and clinic name on top, unit
// address and phone in the footer), the resolved body, and a signature line with the professional's
// name and registration. Ink only, as in every printed document (design system 5.11).
const styles = StyleSheet.create({
  signature: { marginTop: 48, width: 240, alignItems: "center" },
  line: { width: "100%", borderTopWidth: 0.75, borderColor: PDF_COLORS.ink1, marginBottom: 4 },
  name: { fontFamily: PDF_FONTS.sans, fontWeight: 600, fontSize: 10 },
  registration: { fontSize: 9, color: PDF_COLORS.ink2 },
});

function IssuedDocument({ input }: { input: DocumentPdfInput }) {
  return (
    <PdfDocument
      documentTitle={input.documentTitle}
      clinicName={input.clinicName}
      logo={input.logo}
      title={input.title}
      footerNote={input.footerNote}
      pageLabel={input.pageLabel}
    >
      <PdfRichText html={input.bodyHtml} />
      <View style={styles.signature} wrap={false}>
        <View style={styles.line} />
        <Text style={styles.name}>{input.signature.name}</Text>
        {input.signature.registration ? (
          <Text style={styles.registration}>{input.signature.registration}</Text>
        ) : null}
      </View>
    </PdfDocument>
  );
}

export function renderIssuedDocument(input: DocumentPdfInput): Promise<Buffer> {
  return renderPdf(createElement(IssuedDocument, { input }));
}
