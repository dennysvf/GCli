import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { createElement } from "react";
import { PdfDocument, PdfTable, PDF_COLORS } from "@/shared/pdf/document";
import { PDF_FONTS } from "@/shared/pdf/fonts";
import { renderPdf } from "@/shared/pdf/render";
import type { ReceiptInput } from "../application/ports";

// The receipt of a charge (PRD F09): clinic and unit, the number, the patient, the item, the
// amounts, the payments and refunds, and "not a fiscal document". Ink only, like every printed
// document (design system 5.11).
const styles = StyleSheet.create({
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginBottom: 10 },
  metaItem: { minWidth: 120 },
  label: { fontSize: 8, color: PDF_COLORS.ink2, textTransform: "uppercase" },
  value: { fontSize: 10 },
  section: { marginTop: 12 },
  sectionTitle: { fontFamily: PDF_FONTS.serif, fontWeight: 600, fontSize: 11, marginBottom: 4 },
  amounts: { marginTop: 12, alignSelf: "flex-end", width: 220 },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderColor: PDF_COLORS.rule,
  },
  strong: { fontWeight: 600 },
  unit: { fontSize: 8, color: PDF_COLORS.ink2, marginBottom: 6 },
});

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function AmountRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.amountRow}>
      <Text style={strong ? styles.strong : undefined}>{label}</Text>
      <Text style={strong ? styles.strong : undefined}>{value}</Text>
    </View>
  );
}

function Receipt({ input }: { input: ReceiptInput }) {
  const { labels } = input;
  const columns = [
    { label: labels.columns.date, width: "30%" },
    { label: labels.columns.method, width: "25%" },
    { label: labels.columns.unit, width: "25%" },
    { label: labels.columns.amount, width: "20%" },
  ];
  const rows = (items: ReceiptInput["payments"]) =>
    items.map((item) => [item.date, item.method, item.unit, item.amount]);
  const unitLine = [input.unit.name, input.unit.address, input.unit.phone].filter(Boolean).join(" · ");
  return (
    <PdfDocument
      documentTitle={labels.documentTitle}
      clinicName={input.clinicName}
      logo={input.logo}
      title={labels.title}
      subtitle={input.taxId ? `${labels.taxIdLabel}: ${input.taxId}` : undefined}
      footerNote={labels.footerNote}
      pageLabel={labels.pageLabel}
    >
      <Text style={styles.unit}>{unitLine}</Text>
      <View style={styles.meta}>
        <Meta label={labels.numberLabel} value={input.number} />
        <Meta label={labels.dateLabel} value={input.issuedAt} />
        <Meta label={labels.patientLabel} value={input.patient.name} />
        {input.patient.document ? <Meta label={labels.documentLabel} value={input.patient.document} /> : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>{labels.itemLabel}</Text>
        <Text style={styles.value}>{input.item}</Text>
      </View>
      <View style={styles.amounts}>
        <AmountRow label={labels.grossLabel} value={input.gross} />
        {input.discount ? <AmountRow label={labels.discountLabel} value={`− ${input.discount}`} /> : null}
        <AmountRow label={labels.netLabel} value={input.net} strong />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{labels.paymentsTitle}</Text>
        <PdfTable columns={columns} rows={rows(input.payments)} emptyText={labels.noPayments} />
      </View>
      {input.refunds.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{labels.refundsTitle}</Text>
          <PdfTable columns={columns} rows={rows(input.refunds)} emptyText="" />
        </View>
      ) : null}
      <View style={styles.amounts}>
        <AmountRow label={labels.receivedLabel} value={input.received} strong />
        <AmountRow label={labels.balanceLabel} value={input.balance} />
      </View>
    </PdfDocument>
  );
}

export function renderReceipt(input: ReceiptInput): Promise<Buffer> {
  return renderPdf(createElement(Receipt, { input }));
}
