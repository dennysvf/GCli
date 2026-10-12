import { appointmentsReport } from "./appointments";
import { cancellationsReport } from "./cancellations";
import { productivityReport } from "./productivity";
import { receivablesReport } from "./receivables";
import { revenueReport } from "./revenue";
import { REPORT_IDS, type ReportDefinition, type ReportId } from "./types";

// Spec F13 decision D4: one definition per report; the screen, the CSV and the PDF read the same one.
const REPORTS: Record<ReportId, ReportDefinition> = {
  appointments: appointmentsReport,
  cancellations: cancellationsReport,
  revenue: revenueReport,
  receivables: receivablesReport,
  productivity: productivityReport,
};

export function isReportId(value: string): value is ReportId {
  return (REPORT_IDS as readonly string[]).includes(value);
}

export function reportDefinition(id: ReportId): ReportDefinition {
  return REPORTS[id];
}
