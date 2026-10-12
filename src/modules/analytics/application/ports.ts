import type { RequestContext } from "@/shared/context/types";

// The organization header of a report PDF (PRD F13): trade name (or legal name) and the logo.
export type OrganizationHeader = {
  name: string;
  logo: { data: Buffer; format: "png" | "jpg" } | null;
};

export interface OrganizationHeaderLookup {
  header(ctx: RequestContext): Promise<OrganizationHeader>;
}

export type ReportPdfColumn = { label: string; width: string };

// Every text of the page, written in the language of the requester (ADR-028).
export type ReportPdfDocument = {
  clinicName: string;
  logo: OrganizationHeader["logo"];
  title: string;
  subtitle: string;
  generated: string;
  pageLabel: string;
  emptyText: string;
  summaries: { title: string; columns: ReportPdfColumn[]; rows: string[][] }[];
  totals: { label: string; value: string }[];
  columns: ReportPdfColumn[];
  rows: string[][];
  totalsRow: string[] | null;
};

export interface ReportPdfRenderer {
  render(document: ReportPdfDocument): Promise<Buffer>;
}
