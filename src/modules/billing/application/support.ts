import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { diffChanges } from "@/shared/audit/diff";
import { formatLocale, formatMoney } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/locales";
import type { CountryCode, Currency } from "@/shared/kernel/countries/codes";
import type { DomainError } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { Charge, ChargeProps } from "../domain/charge";
import { BillingErrors } from "../domain/errors";
import { billingEvent, type ChargeEventPayload } from "../domain/events";
import type { BillingDeps } from "./ports";

// Loads a charge under its row lock, runs a command on it and saves the result, all in one
// transaction. `expectedVersion` is checked only when the caller depends on the state it saw (a
// discount change); payments rely on the balance check under the lock instead.
export async function mutateCharge<T>(
  deps: BillingDeps,
  ctx: RequestContext,
  chargeId: string,
  options: { expectedVersion?: number | undefined },
  run: (uow: UnitOfWork, charge: Charge) => Promise<Result<T>>,
): Promise<Result<{ value: T; charge: Charge }>> {
  return withTransaction(ctx, async (uow) => {
    const charge = await deps.charges.findById(uow, ctx.organizationId, chargeId, { lock: true });
    if (!charge) return fail(BillingErrors.chargeNotFound());
    if (options.expectedVersion !== undefined && charge.snapshot.version !== options.expectedVersion) {
      return fail(BillingErrors.chargeStale());
    }
    const result = await run(uow, charge);
    if (!result.ok) return result;
    if ((await deps.charges.save(uow, charge)) === "STALE") return fail(BillingErrors.chargeStale());
    return ok({ value: result.value, charge });
  });
}

const AUDITED_FIELDS = [
  "status",
  "discount",
  "discountMinor",
  "discountReason",
  "netMinor",
  "paidMinor",
  "cancelReason",
] as const satisfies readonly (keyof ChargeProps)[];

export function chargeChanges(before: Readonly<ChargeProps> | null, after: Readonly<ChargeProps>) {
  return diffChanges<ChargeProps>(before, after, { fields: [...AUDITED_FIELDS] });
}

export function chargeEventPayload(charge: Charge, actorUserId: string): ChargeEventPayload {
  const s = charge.snapshot;
  return {
    chargeId: s.id,
    number: s.number,
    patientId: s.patientId,
    origin: s.origin,
    appointmentId: s.appointmentId,
    unitId: s.unitId,
    currency: s.currency,
    grossMinor: s.grossMinor,
    netMinor: s.netMinor,
    actorUserId,
  };
}

export { billingEvent };

// Copy of the state before a command, for the audit diff.
export function copyProps(charge: Charge): ChargeProps {
  const s = charge.snapshot;
  return { ...s, payments: s.payments.map((payment) => ({ ...payment })) };
}

// Errors carry amounts in minor units; the user reads them in the language and format of the unit's country.
export function localizeMoneyParams(
  error: DomainError,
  locale: Locale,
  country: CountryCode | null,
): DomainError {
  const params = error.params;
  if (!params || typeof params.currency !== "string") return error;
  const intl = formatLocale(locale, country);
  const currency = params.currency as Currency;
  const text = (value: string | number | undefined) =>
    formatMoney({ amountMinor: Number(value), currency }, intl);
  const next: Record<string, string | number> = { ...params };
  if ("amountMinor" in params) next.amount = text(params.amountMinor);
  if ("balanceMinor" in params) next.balance = text(params.balanceMinor);
  if ("availableMinor" in params) next.available = text(params.availableMinor);
  return { ...error, params: next };
}

export function withMoneyText<T>(result: Result<T>, locale: Locale, country: CountryCode | null): Result<T> {
  return result.ok ? result : fail(localizeMoneyParams(result.error, locale, country));
}
