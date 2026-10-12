import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { toCsv, type CsvCell } from "@/shared/i18n/csv";
import { formatDate, formatDateTime, formatLocale, formatMoney } from "@/shared/i18n/format";
import type { Translator } from "@/shared/i18n/translator";
import type { Currency } from "@/shared/kernel/countries/codes";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { AnalyticsErrors } from "../domain/errors";
import { CSV_MAX_ROWS, EXPORT_BATCH_SIZE, PDF_MAX_ROWS } from "../domain/limits";
import { csvHeader, csvRow, displayCell, totalsRow, viewColumns } from "./reports/format";
import { prepareReport, type PreparedReport } from "./reports/prepare";
import type {
  OrganizationHeaderLookup,
  ReportPdfColumn,
  ReportPdfDocument,
  ReportPdfRenderer,
} from "./ports";
import type { ColumnDef, Cursor, ReportFilters, ReportId } from "./reports/types";

export type ReportExportDeps = {
  clock: () => Date;
  organizationHeader: OrganizationHeaderLookup;
  pdf: ReportPdfRenderer;
};

export type ReportExportFormat = "csv" | "pdf";

export type ReportExport = {
  fileName: string;
  contentType: string;
  rowCount: number;
  body: ReadableStream<Uint8Array> | Buffer;
};

// Filters that apply to each report, in the order they are written in the PDF subtitle.
const APPLICABLE_FILTERS: Record<ReportId, (keyof ReportFilters)[]> = {
  appointments: ["service", "status"],
  cancellations: ["service", "type", "origin", "reason"],
  revenue: ["groupBy", "method", "service"],
  receivables: ["origin", "bucket"],
  productivity: [],
};

// Relative widths of the PDF columns by kind.
const WIDTH_WEIGHT: Record<ColumnDef["kind"], number> = {
  text: 14,
  date: 8,
  time: 6,
  count: 8,
  hours: 8,
  money: 11,
  label: 11,
  stamp: 11,
};

function pdfColumns(columns: ColumnDef[], labels: string[]): ReportPdfColumn[] {
  const total = columns.reduce((sum, column) => sum + WIDTH_WEIGHT[column.kind], 0);
  return columns.map((column, index) => ({
    label: labels[index] ?? column.key,
    width: `${((WIDTH_WEIGHT[column.kind] / total) * 100).toFixed(2)}%`,
  }));
}

function valueOfFilter(name: keyof ReportFilters, report: ReportId, value: string, t: Translator): string {
  switch (name) {
    case "status":
      return t(`analytics.reports.values.status.${value}`);
    case "type":
      return t(`analytics.reports.filters.typeOptions.${value}`);
    case "origin":
      return t(
        `analytics.reports.values.${report === "receivables" ? "chargeOrigin" : "cancellationOrigin"}.${value}`,
      );
    case "groupBy":
      return t(`analytics.reports.groupLabels.${value}`);
    case "method":
      return t(`analytics.reports.values.method.${value}`);
    case "bucket":
      return t(`analytics.reports.values.bucket.${value}`);
    default:
      return value;
  }
}

// Names of the unit, professional, service and reason chosen in the filters, for the PDF subtitle.
async function filterLines(ctx: RequestContext, prepared: PreparedReport): Promise<string[]> {
  const { id, rc, selection, parsed, t } = prepared;
  const lines: string[] = [];
  const filter = (name: string, value: string) => t("analytics.reports.pdf.filter", { name, value });
  const intl = formatLocale(ctx.locale);
  lines.push(
    t("analytics.reports.pdf.period", {
      from: formatDate(selection.scope.period.from, intl),
      to: formatDate(selection.scope.period.to, intl),
    }),
  );
  if (parsed.unit !== "ALL" && selection.units[0])
    lines.push(filter(t("analytics.reports.unitLabel"), await nameOf(ctx, "unit", parsed.unit)));
  if (parsed.professional !== "ALL")
    lines.push(
      filter(
        t("analytics.reports.professionalLabel"),
        await nameOf(ctx, "professional", parsed.professional),
      ),
    );
  for (const name of APPLICABLE_FILTERS[id]) {
    const value = rc.filters[name];
    if (typeof value !== "string" || value === "ALL" || (name === "groupBy" && value === "METHOD")) continue;
    const text =
      name === "service"
        ? await nameOf(ctx, "service", value)
        : name === "reason"
          ? await nameOf(ctx, "cancellation_reason", value)
          : valueOfFilter(name, id, value, t);
    lines.push(filter(t(`analytics.reports.filters.${name}`), text));
  }
  return lines;
}

async function nameOf(
  ctx: RequestContext,
  table: "unit" | "professional" | "service" | "cancellation_reason",
  id: string,
): Promise<string> {
  const result = await withTransaction(ctx, async (uow) => {
    const rows =
      table === "unit"
        ? await uow.tx.$queryRaw<{ name: string }[]>`
            SELECT name FROM unit WHERE organization_id = ${ctx.organizationId}::uuid AND id = ${id}::uuid`
        : table === "professional"
          ? await uow.tx.$queryRaw<{ name: string }[]>`
              SELECT coalesce(display_name, full_name) AS name FROM professional
              WHERE organization_id = ${ctx.organizationId}::uuid AND id = ${id}::uuid`
          : table === "service"
            ? await uow.tx.$queryRaw<{ name: string }[]>`
                SELECT name FROM service WHERE organization_id = ${ctx.organizationId}::uuid AND id = ${id}::uuid`
            : await uow.tx.$queryRaw<{ name: string }[]>`
                SELECT name FROM cancellation_reason
                WHERE organization_id = ${ctx.organizationId}::uuid AND id = ${id}::uuid`;
    return ok(rows[0]?.name ?? "");
  });
  return result.ok ? result.value : "";
}

// Rows after the first batch have no BOM and no header: toCsv writes both for its first row, so
// the BOM is cut and the first row is passed as that "header".
function csvChunk(rows: CsvCell[][], locale: RequestContext["locale"]): string {
  const [first, ...rest] = rows;
  if (!first) return "";
  return toCsv(
    first.map((cell) => String(cell ?? "")),
    rest,
    locale,
  ).slice(1);
}

function csvStream(ctx: RequestContext, prepared: PreparedReport): ReadableStream<Uint8Array> {
  const { definition, rc, t } = prepared;
  const encoder = new TextEncoder();
  let cursor: Cursor | null = null;
  let offset = 0;
  let started = false;
  let finished = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) {
        controller.close();
        return;
      }
      try {
        const batch = await withTransaction(ctx, async (uow) =>
          ok(await definition.rows(uow, rc, { limit: EXPORT_BATCH_SIZE, offset, after: cursor })),
        );
        if (!batch.ok) throw new Error(batch.error.code);
        const lines = batch.value.rows.map((row) => csvRow(definition.columns, row, t, ctx.locale));
        let text = "";
        if (!started) {
          // BOM, then the header and the first rows.
          text = toCsv(csvHeader(definition.columns, t, rc.filters.groupBy), lines, ctx.locale);
          started = true;
        } else {
          text = csvChunk(lines, ctx.locale);
        }
        if (text) controller.enqueue(encoder.encode(text));
        cursor = batch.value.cursor;
        offset += batch.value.rows.length;
        // The productivity report has no cursor and is read in one batch.
        if (batch.value.rows.length < EXPORT_BATCH_SIZE || batch.value.cursor === null) finished = true;
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function renderPdf(
  deps: ReportExportDeps,
  ctx: RequestContext,
  prepared: PreparedReport,
  now: Date,
  totalsInput: Awaited<ReturnType<PreparedReport["definition"]["totals"]>>,
): Promise<Buffer> {
  const { id, definition, rc, t } = prepared;
  const intl = formatLocale(ctx.locale);
  const [header, filters, data] = await Promise.all([
    deps.organizationHeader.header(ctx),
    filterLines(ctx, prepared),
    withTransaction(ctx, async (uow) => {
      const [summaries, rows] = await Promise.all([
        definition.summaries(uow, rc),
        definition.rows(uow, rc, { limit: PDF_MAX_ROWS, offset: 0 }),
      ]);
      return ok({ summaries, rows: rows.rows });
    }),
  ]);
  if (!data.ok) throw new Error(data.error.code);
  const labels = viewColumns(definition.columns, t, rc.filters.groupBy).map((column) => column.label);
  const totals = totalsRow(id, definition.columns, totalsInput, t, ctx.locale);
  const moneyLabels: Record<string, string> = {
    price: "price",
    net: "net",
    payments: "payments",
    refunds: "refunds",
    amount: "amount",
    balance: "balance",
    billed: "billed",
    received: "received",
  };
  const pairs = [
    { label: t("analytics.reports.columns.count"), value: String(totalsInput.rowCount) },
    ...Object.entries(totalsInput.money)
      .filter(([metric]) => moneyLabels[metric])
      .map(([metric, list]) => ({
        label: t(`analytics.reports.columns.${moneyLabels[metric]}`),
        value: list
          .map((money) =>
            formatMoney({ amountMinor: money.amountMinor, currency: money.currency as Currency }, intl),
          )
          .join(" · "),
      })),
  ];
  const document: ReportPdfDocument = {
    clinicName: header.name,
    logo: header.logo,
    title: t(`analytics.reports.names.${id}`),
    subtitle: filters.join(" · "),
    generated: t("analytics.reports.pdf.generated", {
      at: formatDateTime(now, intl, prepared.selection.timeZone),
      user: ctx.user.name,
    }),
    pageLabel: t("analytics.reports.pdf.page", { page: "{page}", total: "{total}" }),
    emptyText: t("analytics.reports.pdf.empty"),
    summaries: data.value.summaries.map((summary) => ({
      title: t(`analytics.reports.summaries.${summary.key}`),
      columns: pdfColumns(
        summary.columns,
        viewColumns(summary.columns, t, rc.filters.groupBy).map((c) => c.label),
      ),
      rows: summary.rows.map((row) =>
        summary.columns.map((column) => displayCell(column, row[column.key], t, ctx.locale)),
      ),
    })),
    totals: pairs,
    columns: pdfColumns(definition.columns, labels),
    rows: data.value.rows.map((row) =>
      definition.columns.map((column) => displayCell(column, row[column.key], t, ctx.locale)),
    ),
    totalsRow:
      data.value.rows.length > 0
        ? definition.columns.map((column) => (totals[column.key] ?? []).join(" · "))
        : null,
  };
  return deps.pdf.render(document);
}

// PRD F13: CSV (streamed, up to 50,000 rows) and PDF (up to 5,000 rows) of a report. The limit is
// checked before any byte is produced, and the audit event is committed before the first byte
// (ADR-038).
export async function exportReport(
  deps: ReportExportDeps,
  ctx: RequestContext,
  report: string,
  format: ReportExportFormat,
  input: unknown,
): Promise<Result<ReportExport>> {
  const now = deps.clock();
  const prepared = await prepareReport(ctx, report, input, now);
  if (!prepared.ok) return prepared;
  const { id, definition, selection, rc, t, parsed } = prepared.value;

  const counted = await withTransaction(ctx, async (uow) => ok(await definition.totals(uow, rc)));
  if (!counted.ok) return counted;
  const totals = counted.value;
  const limit = format === "csv" ? CSV_MAX_ROWS : PDF_MAX_ROWS;
  if (totals.rowCount > limit)
    return fail(
      format === "csv"
        ? AnalyticsErrors.exportTooLarge(totals.rowCount)
        : AnalyticsErrors.pdfTooLarge(totals.rowCount),
    );

  const filters = Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== "page"));
  const audited = await withTransaction(ctx, async (uow) => {
    await uow.audit.record({
      action: "EXPORT",
      entityType: "report",
      summary: `${t(`analytics.reports.names.${id}`)} (${format.toUpperCase()})`,
      metadata: {
        report: id,
        format,
        rows: totals.rowCount,
        filters: { ...filters, ...selection.scope.period },
      },
    });
    return ok(undefined);
  });
  if (!audited.ok) return audited;

  const { from, to } = selection.scope.period;
  const fileName = `${t(`analytics.reports.files.${id}`)}-${from}-${to}.${format}`;
  if (format === "csv")
    return ok({
      fileName,
      contentType: "text/csv; charset=utf-8",
      rowCount: totals.rowCount,
      body: csvStream(ctx, prepared.value),
    });
  const bytes = await renderPdf(deps, ctx, prepared.value, now, totals);
  return ok({ fileName, contentType: "application/pdf", rowCount: totals.rowCount, body: bytes });
}
