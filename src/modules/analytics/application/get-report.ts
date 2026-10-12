import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { ok, type Result } from "@/shared/kernel/result";
import { CSV_MAX_ROWS, PDF_MAX_ROWS, REPORT_PAGE_SIZE } from "../domain/limits";
import type { DateRange } from "../domain/period";
import type { AnalyticsDeps } from "./get-dashboard";
import { totalsRow, viewColumns, viewRow, type ViewCell, type ViewColumn } from "./reports/format";
import { prepareReport } from "./reports/prepare";
import type { ReportId } from "./reports/types";

export type ReportSummaryView = {
  key: string;
  title: string;
  columns: ViewColumn[];
  rows: Record<string, ViewCell>[];
};

// One page of a report, already formatted in the user's language (spec F13 section 5). Money is
// text with its currency, so nothing here needs BigInt on the client.
export type ReportView = {
  report: ReportId;
  period: DateRange;
  columns: ViewColumn[];
  rows: Record<string, ViewCell>[];
  // The totals row of the table: lines per column, one per currency for money.
  totalsRow: Record<string, string[]>;
  totals: { rowCount: number; counts: Record<string, number> };
  summaries: ReportSummaryView[];
  page: number;
  pageSize: number;
  pageCount: number;
  exportLimits: { csv: number; pdf: number };
  generatedAt: string;
};

// PRD F13: one page (50 rows) of a report with its totals and summaries. Totals come from the
// aggregate query over the whole result, never from the page shown.
export async function getReport(
  deps: Pick<AnalyticsDeps, "clock">,
  ctx: RequestContext,
  report: string,
  input: unknown,
): Promise<Result<ReportView>> {
  const now = deps.clock();
  const prepared = await prepareReport(ctx, report, input, now);
  if (!prepared.ok) return prepared;
  const { id, definition, selection, rc, t } = prepared.value;

  const data = await withTransaction(ctx, async (uow) => {
    const totals = await definition.totals(uow, rc);
    const pageCount = Math.max(1, Math.ceil(totals.rowCount / REPORT_PAGE_SIZE));
    const page = Math.min(rc.filters.page, pageCount);
    const [summaries, rows] = await Promise.all([
      definition.summaries(uow, rc),
      definition.rows(uow, rc, { limit: REPORT_PAGE_SIZE, offset: (page - 1) * REPORT_PAGE_SIZE }),
    ]);
    return ok({ totals, summaries, rows: rows.rows, page, pageCount });
  });
  if (!data.ok) return data;
  const { totals, summaries, rows, page, pageCount } = data.value;
  const groupBy = rc.filters.groupBy;

  return ok({
    report: id,
    period: selection.scope.period,
    columns: viewColumns(definition.columns, t, groupBy),
    rows: rows.map((row) => viewRow(definition.columns, row, t, ctx.locale)),
    totalsRow: totalsRow(id, definition.columns, totals, t, ctx.locale),
    totals: { rowCount: totals.rowCount, counts: totals.counts },
    summaries: summaries.map((summary) => ({
      key: summary.key,
      title: t(`analytics.reports.summaries.${summary.key}`),
      columns: viewColumns(summary.columns, t, groupBy),
      rows: summary.rows.map((row) => viewRow(summary.columns, row, t, ctx.locale)),
    })),
    page,
    pageSize: REPORT_PAGE_SIZE,
    pageCount,
    exportLimits: { csv: CSV_MAX_ROWS, pdf: PDF_MAX_ROWS },
    generatedAt: now.toISOString(),
  });
}
