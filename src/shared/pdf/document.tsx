import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { PDF_FONTS } from "./fonts";

// Page template shared by every generated document (ADR-024, architecture 11.2 template method):
// the clinic header, a serif title with the double rule, a variable body and a footer with the
// author and the page number. The PDF engine cannot read CSS variables, so the ink tokens of
// src/app/globals.css are mirrored here; print uses no accent colors (design system 5.11).
export const PDF_COLORS = { ink1: "#2b2925", ink2: "#5f5b53", rule: "#dcd8ce" } as const;

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontFamily: PDF_FONTS.sans,
    fontSize: 9,
    color: PDF_COLORS.ink1,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 },
  logo: { maxWidth: 120, maxHeight: 40, objectFit: "contain" },
  clinic: { fontSize: 9, color: PDF_COLORS.ink2 },
  title: { fontFamily: PDF_FONTS.serif, fontWeight: 600, fontSize: 16 },
  subtitle: { fontSize: 10, color: PDF_COLORS.ink2, marginTop: 2 },
  doubleRule: {
    marginTop: 8,
    marginBottom: 12,
    height: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: PDF_COLORS.rule,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: PDF_COLORS.ink2,
  },
});

export type PdfPageProps = {
  documentTitle: string;
  clinicName: string;
  logo?: { data: Buffer; format: "png" | "jpg" } | null;
  title: string;
  subtitle?: string;
  footerNote: string;
  children?: ReactNode;
};

export function PdfDocument({
  documentTitle,
  clinicName,
  logo,
  title,
  subtitle,
  footerNote,
  children,
}: PdfPageProps) {
  return (
    <Document title={documentTitle} author={clinicName} creator="GCli" producer="GCli">
      <Page size="A4" orientation="portrait" style={styles.page} wrap>
        <View style={styles.header} fixed>
          {/* react-pdf images have no alt text; the clinic name is written next to the logo. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {logo ? <Image style={styles.logo} src={{ data: logo.data, format: logo.format }} /> : null}
          <Text style={styles.clinic}>{clinicName}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.doubleRule} />
        {children}
        <View style={styles.footer} fixed>
          <Text>{footerNote}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

// A table with fine horizontal rules and no vertical borders (design system 5.4).
const tableStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: PDF_COLORS.rule,
    paddingVertical: 4,
  },
  head: { fontWeight: 600, color: PDF_COLORS.ink2, fontSize: 8, textTransform: "uppercase" },
  cell: { paddingRight: 6 },
  empty: { color: PDF_COLORS.ink2, marginTop: 8 },
});

export type PdfColumn = { label: string; width: string };

export function PdfTable({
  columns,
  rows,
  emptyText,
}: {
  columns: PdfColumn[];
  rows: string[][];
  emptyText: string;
}) {
  return (
    <View>
      <View style={tableStyles.row} fixed>
        {columns.map((column) => (
          <Text key={column.label} style={[tableStyles.cell, tableStyles.head, { width: column.width }]}>
            {column.label}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? <Text style={tableStyles.empty}>{emptyText}</Text> : null}
      {rows.map((row, index) => (
        <View key={index} style={tableStyles.row} wrap={false}>
          {row.map((value, cellIndex) => (
            <Text key={cellIndex} style={[tableStyles.cell, { width: columns[cellIndex]?.width ?? "auto" }]}>
              {value}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
