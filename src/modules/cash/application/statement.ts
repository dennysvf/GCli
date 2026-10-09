import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { daysBetween } from "@/shared/kernel/calendar-date";
import { currencyOf } from "@/shared/kernel/countries/codes";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { CashErrors } from "../domain/errors";
import { MAX_STATEMENT_DAYS } from "../domain/limits";
import { buildStatement, type Statement, type StatementInput } from "../domain/statement";
import type { CashDeps } from "./ports";
import { statementSchema } from "./schemas";

export type StatementView = Statement & {
  currency: string;
  from: string;
  to: string;
  // Display names of the patients on payment lines, by line order key.
  patientNames: Record<string, string>;
};

// PRD F11: the statement of a unit (or "Geral", or all) in one period of at most 366 days. It starts
// from the balance before the period and keeps a running balance in a single currency (ADR-029).
export async function getStatement(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<StatementView>> {
  const allowed = await authorize(ctx, "finance:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(statementSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  if (data.to < data.from || daysBetween(data.from, data.to) + 1 > MAX_STATEMENT_DAYS) {
    return fail(CashErrors.periodTooLong());
  }

  const allUnits = await deps.directory.units(ctx, { activeOnly: false });
  const chosen =
    data.unit === "ALL"
      ? allUnits
      : data.unit === "GENERAL"
        ? []
        : allUnits.filter((unit) => unit.id === data.unit);
  if (data.unit !== "ALL" && data.unit !== "GENERAL" && chosen.length === 0)
    return fail(CashErrors.unitInvalid());
  const includeGeneral = data.unit === "ALL" || data.unit === "GENERAL";

  const candidates = [...new Set(chosen.map((unit) => unit.currency as string))];
  if (includeGeneral && !candidates.includes(currencyOf(ctx.organizationCountry))) {
    candidates.push(currencyOf(ctx.organizationCountry));
  }
  const currency = data.currency ?? (candidates.length === 1 ? candidates[0] : null);
  if (!currency) return fail(CashErrors.currencyRequired());
  const units = chosen.filter((unit) => unit.currency === currency);
  const unitIds = units.map((unit) => unit.id);
  const zoneOf = new Map(units.map((unit) => [unit.id, unit.timeZone]));

  const payments =
    unitIds.length > 0
      ? await deps.billing.payments(ctx, { unitIds, currency, from: null, to: null })
      : ok([]);
  if (!payments.ok) return payments;

  const loaded = await withTransaction(ctx, async (uow) => {
    const [entries, movements] = await Promise.all([
      deps.reads.paidEntries(uow, { unitIds, includeGeneral, currency, from: null, to: data.to }),
      unitIds.length > 0
        ? deps.reads.statementMovements(uow, { unitIds, currency, from: null, to: data.to })
        : Promise.resolve([]),
    ]);
    return ok({ entries, movements });
  });
  if (!loaded.ok) return loaded;

  const lines: StatementInput[] = [];
  const patientIds: string[] = [];
  for (const payment of payments.value) {
    const date = dateInTimeZone(payment.receivedAt, zoneOf.get(payment.unitId) ?? "UTC");
    if (date > data.to) continue;
    lines.push({
      date,
      source: "PATIENT",
      description: payment.patientId,
      reference: payment.chargeNumber,
      category: null,
      amountMinor: payment.amountMinor,
      order: payment.receivedAt.toISOString() + payment.id,
    });
    if (date >= data.from) patientIds.push(payment.patientId);
  }
  for (const entry of loaded.value.entries) {
    lines.push({
      date: entry.paidOn,
      source: entry.kind === "REVENUE" ? "REVENUE" : "EXPENSE",
      description: entry.description,
      category: entry.categoryName,
      amountMinor: entry.kind === "REVENUE" ? entry.amountMinor : -entry.amountMinor,
      order: entry.paymentId,
    });
  }
  for (const movement of loaded.value.movements) {
    lines.push({
      date: movement.businessDate,
      source: movement.direction === "IN" ? "CASH_IN" : "CASH_OUT",
      description: movement.description,
      category: movement.categoryName,
      amountMinor: movement.direction === "IN" ? movement.amountMinor : -movement.amountMinor,
      order: movement.createdAt.toISOString() + movement.id,
    });
  }

  const previous = lines
    .filter((line) => line.date < data.from)
    .reduce((sum, line) => sum + line.amountMinor, 0);
  const inPeriod = lines.filter((line) => line.date >= data.from);
  const statement = buildStatement({ previousBalanceMinor: previous, lines: inPeriod });

  // Patient lines carry the patient id as description until the names are known.
  const names = await deps.directory.patientNames(ctx, patientIds);
  const patientNames: Record<string, string> = {};
  const resolved = statement.lines.map((line) => {
    if (line.source !== "PATIENT") return line;
    const name = names.get(line.description) ?? "";
    patientNames[line.description] = name;
    return { ...line, description: name };
  });
  return ok({ ...statement, lines: resolved, currency, from: data.from, to: data.to, patientNames });
}
