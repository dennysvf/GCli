import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { toCsv, type CsvCell } from "@/shared/i18n/csv";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { auditText, type AuditText } from "./display";
import { AUDIT_LOG_ENTITY_TYPE } from "./entity-types";
import { AuditErrors } from "./errors";
import { prepareFilters, type PreparedFilters } from "./filters";
import { AUDIT_COUNT_CAP, AUDIT_CSV_MAX_ROWS, AUDIT_EXPORT_BATCH_SIZE } from "./limits";
import { changesText, presentChanges } from "./present-changes";
import { cappedCount, listEvents, type AuditEventRow, type AuditKey } from "./queries";
import type { AuditDeps } from "./search-events";

export type AuditExport = {
  fileName: string;
  contentType: string;
  rowCount: number;
  body: ReadableStream<Uint8Array>;
};

const CSV_COLUMNS = [
  "date",
  "time",
  "user",
  "action",
  "entityType",
  "entityId",
  "summary",
  "changes",
  "ipAddress",
  "eventId",
] as const;

function csvRow(row: AuditEventRow, text: AuditText): CsvCell[] {
  const changes = presentChanges(row.changes, { subjectAnonymized: row.subject_anonymized }, text.display);
  return [
    text.date(row.occurred_at),
    text.time(row.occurred_at),
    text.actor({ type: row.actor_type, name: row.actor_name, userId: row.actor_user_id }),
    text.action(row.action),
    text.entityType(row.entity_type),
    row.entity_id ?? "",
    text.summary(row),
    changesText(changes, text.display),
    row.ip_address ?? "",
    row.id,
  ];
}

// The rows of later batches carry no BOM and no header: toCsv writes both, so its first row is
// passed as the "header" and the BOM is cut (the same approach as the F13 export).
function csvChunk(rows: CsvCell[][], locale: RequestContext["locale"]): string {
  const [first, ...rest] = rows;
  if (!first) return "";
  return toCsv(
    first.map((cell) => String(cell ?? "")),
    rest,
    locale,
  ).slice(1);
}

function csvStream(
  ctx: RequestContext,
  prepared: PreparedFilters,
  text: AuditText,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const header = CSV_COLUMNS.map((column) => text.t(`audit.csv.${column}`));
  let after: AuditKey | null = null;
  let written = 0;
  let started = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // PRD F15: never more than the export limit, even if events arrive during the export.
        const limit = Math.min(AUDIT_EXPORT_BATCH_SIZE, AUDIT_CSV_MAX_ROWS - written);
        const batch =
          limit > 0
            ? await withTransaction(ctx, async (uow) =>
                ok(await listEvents(uow, prepared.scope, { limit, after, detail: true })),
              )
            : ok([] as AuditEventRow[]);
        if (!batch.ok) throw new Error(batch.error.code);
        const rows = batch.value;
        const lines = rows.map((row) => csvRow(row, text));
        const chunk = started ? csvChunk(lines, ctx.locale) : toCsv(header, lines, ctx.locale);
        started = true;
        if (chunk) controller.enqueue(encoder.encode(chunk));
        written += rows.length;
        const last = rows.at(-1);
        if (last) after = { occurredAt: last.occurred_key, id: last.id };
        // Closing here matters: an empty last batch enqueues nothing, so no further pull would run.
        if (rows.length < limit || limit === 0) controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

// ExportAuditEvents (PRD F15): the CSV of the current filters, up to 100,000 rows, in the F13
// format. The limit is checked before any byte, and the EXPORT event is committed before the first
// byte (spec F15 decision D8, ADR-038). The rows have the same masking as the detail panel.
export async function exportEvents(
  deps: AuditDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<AuditExport>> {
  const allowed = await authorize(ctx, "audit:read");
  if (!allowed.ok) return allowed;
  const filtersInput =
    input && typeof input === "object" ? { ...(input as Record<string, unknown>), cursor: undefined } : input;
  const prepared = await prepareFilters(ctx, filtersInput, deps.clock());
  if (!prepared.ok) return prepared;
  const { scope, filters, period, timeZone } = prepared.value;

  const counted = await withTransaction(ctx, async (uow) =>
    ok(await cappedCount(uow, scope, AUDIT_COUNT_CAP)),
  );
  if (!counted.ok) return counted;
  const rowCount = counted.value;
  if (rowCount > AUDIT_CSV_MAX_ROWS) return fail(AuditErrors.exportTooLarge(rowCount));

  const audited = await withTransaction(ctx, async (uow) => {
    await uow.audit.record({
      action: "EXPORT",
      entityType: AUDIT_LOG_ENTITY_TYPE,
      summary: "Exportação do log de auditoria (CSV)",
      metadata: { format: "csv", rows: rowCount, filters },
    });
    return ok(undefined);
  });
  if (!audited.ok) return audited;

  const text = auditText(ctx.locale, timeZone);
  return ok({
    fileName: `${text.t("audit.csv.fileSlug")}-${period.from}-${period.to}.csv`,
    contentType: "text/csv; charset=utf-8",
    rowCount,
    body: csvStream(ctx, prepared.value, text),
  });
}
