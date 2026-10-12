import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { createTranslator, type Translator } from "@/shared/i18n/translator";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { AnalyticsErrors } from "../../domain/errors";
import { resolveSelection, type ResolvedSelection } from "../selection";
import { isReportId, reportDefinition } from "./registry";
import { reportFiltersSchema, type ParsedReportFilters } from "./schemas";
import type { ReportContext, ReportDefinition, ReportFilters, ReportId } from "./types";

export type PreparedReport = {
  id: ReportId;
  definition: ReportDefinition;
  parsed: ParsedReportFilters;
  selection: ResolvedSelection;
  rc: ReportContext;
  t: Translator;
};

// Authorize, parse, resolve units and period, and check the references of the filters. Shared by
// the screen and the exports, so both apply exactly the same rules (spec F13 decision D4).
export async function prepareReport(
  ctx: RequestContext,
  reportParam: string,
  input: unknown,
  now: Date,
): Promise<Result<PreparedReport>> {
  const allowed = await authorize(ctx, "report:read");
  if (!allowed.ok) return allowed;
  if (!isReportId(reportParam)) return fail(AnalyticsErrors.reportNotFound());
  const parsed = parseInput(reportFiltersSchema(reportParam), input);
  if (!parsed.ok) return parsed;
  const selection = await resolveSelection(ctx, parsed.value, now);
  if (!selection.ok) return selection;
  const definition = reportDefinition(reportParam);

  const service =
    definition.referencesService && parsed.value.service !== "ALL" ? parsed.value.service : null;
  const reason = definition.referencesReason && parsed.value.reason !== "ALL" ? parsed.value.reason : null;
  if (service || reason) {
    const found = await withTransaction(ctx, async (uow) => {
      const [services, reasons] = await Promise.all([
        service
          ? uow.tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM service WHERE organization_id = ${ctx.organizationId}::uuid AND id = ${service}::uuid`
          : Promise.resolve([{ id: "" }]),
        reason
          ? uow.tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM cancellation_reason WHERE organization_id = ${ctx.organizationId}::uuid AND id = ${reason}::uuid`
          : Promise.resolve([{ id: "" }]),
      ]);
      return ok({ service: services.length > 0, reason: reasons.length > 0 });
    });
    if (!found.ok) return found;
    if (!found.value.service) return fail(AnalyticsErrors.serviceInvalid());
    if (!found.value.reason) return fail(AnalyticsErrors.reasonInvalid());
  }

  const filters: ReportFilters = {
    page: parsed.value.page,
    service: parsed.value.service,
    status: parsed.value.status,
    type: parsed.value.type,
    origin: parsed.value.origin,
    reason: parsed.value.reason,
    groupBy: parsed.value.groupBy,
    method: parsed.value.method,
    bucket: parsed.value.bucket,
  };
  return ok({
    id: reportParam,
    definition,
    parsed: parsed.value,
    selection: selection.value,
    rc: {
      scope: selection.value.scope,
      filters,
      now,
      unitCountries: new Map(selection.value.units.map((unit) => [unit.id, unit.country])),
    },
    t: createTranslator(ctx.locale),
  });
}
