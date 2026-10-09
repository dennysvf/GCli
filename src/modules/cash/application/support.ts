import { diffChanges } from "@/shared/audit/diff";
import { authorize } from "@/shared/authz/guard";
import { can, type Action } from "@/shared/authz/permissions";
import type { RequestContext, SystemContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { formatLocale, formatMoney } from "@/shared/i18n/format";
import type { Currency } from "@/shared/kernel/countries/codes";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { localMinuteToUtc } from "@/shared/kernel/zoned-time";
import { CashErrors } from "../domain/errors";
import type { CashRegister, RegisterProps } from "../domain/cash-register";
import type { EntryProps } from "../domain/financial-entry";
import type { CashDeps, UnitInfo } from "./ports";

// Either of the cash actions opens the shared reads (categories, attachments); the denial is
// recorded for the first action when none is held.
export async function authorizeAny(ctx: RequestContext, actions: readonly Action[]): Promise<Result<void>> {
  for (const action of actions) if (can(ctx, action)) return ok(undefined);
  return authorize(ctx, actions[0] as Action);
}

export function systemContext(organizationId: string): SystemContext {
  return { kind: "system", requestId: newId(), organizationId, ipAddress: null, userAgent: null };
}

// The UTC window of a business date in the unit's time zone (ADR-019, ADR-030).
export function dayWindow(businessDate: string, timeZone: string): { from: Date; to: Date } {
  return {
    from: localMinuteToUtc(businessDate, 0, timeZone),
    to: localMinuteToUtc(businessDate, 1440, timeZone),
  };
}

export function moneyText(ctx: RequestContext, unit: UnitInfo, amountMinor: number): string {
  return formatMoney(
    { amountMinor, currency: unit.currency as Currency },
    formatLocale(ctx.locale, unit.country),
  );
}

export async function loadUnit(
  deps: CashDeps,
  ctx: RequestContext,
  unitId: string,
): Promise<Result<UnitInfo>> {
  const unit = await deps.directory.unit(ctx, unitId);
  return unit ? ok(unit) : fail(CashErrors.unitInvalid());
}

// Loads a register under its row lock, runs a command on it and saves the result, all in one
// transaction. `expectedVersion` is checked only when the caller depends on the state it saw.
export async function mutateRegister<T>(
  deps: CashDeps,
  ctx: RequestContext,
  registerId: string,
  run: (uow: UnitOfWork, register: CashRegister) => Promise<Result<T>>,
): Promise<Result<{ value: T; register: CashRegister }>> {
  return withTransaction(ctx, async (uow) => {
    const register = await deps.registers.findById(uow, registerId, { lock: true });
    if (!register) return fail(CashErrors.registerNotFound());
    const result = await run(uow, register);
    if (!result.ok) return result;
    if ((await deps.registers.save(uow, register)) === "STALE") return fail(CashErrors.stale());
    return ok({ value: result.value, register });
  });
}

const REGISTER_AUDITED = ["status", "openingMinor", "flaggedUnclosed"] as const;

export function registerChanges(before: Readonly<RegisterProps> | null, after: Readonly<RegisterProps>) {
  return diffChanges<RegisterProps>(before, after, { fields: [...REGISTER_AUDITED] });
}

const ENTRY_AUDITED = [
  "description",
  "categoryId",
  "unitId",
  "currency",
  "amountMinor",
  "dueDate",
  "status",
] as const;

export function entryChanges(before: Readonly<EntryProps> | null, after: Readonly<EntryProps>) {
  return diffChanges<EntryProps>(before, after, { fields: [...ENTRY_AUDITED] });
}

export function copyRegister(register: CashRegister): RegisterProps {
  return { ...register.snapshot };
}
