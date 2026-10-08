import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { countryProfile } from "@/shared/kernel/countries";
import type { CountryCode } from "@/shared/kernel/countries/codes";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { BillingErrors } from "../domain/errors";
import type { BillingDeps } from "./ports";
import { paymentMethodSchema } from "./schemas";

// Payment methods keep the stable codes of the country profile (PRD F16); an organization can
// disable codes per country (PRD F09, interview). With nothing disabled, every code is enabled.
export type PaymentMethodSetting = { country: CountryCode; method: string; enabled: boolean };

export async function enabledMethods(uow: UnitOfWork, country: CountryCode): Promise<string[]> {
  const disabled = await uow.tx.disabledPaymentMethod.findMany({
    where: { country },
    select: { method: true },
  });
  const off = new Set(disabled.map((row) => row.method));
  return countryProfile(country).paymentMethods.filter((method) => !off.has(method));
}

// The countries of the organization's active units, each with its methods and their state.
export async function listPaymentMethodSettings(
  deps: BillingDeps,
  ctx: RequestContext,
): Promise<Result<PaymentMethodSetting[]>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const units = await deps.directory.activeUnits(ctx);
  const countries = [...new Set([ctx.organizationCountry, ...units.map((unit) => unit.country)])];
  return withTransaction(ctx, async (uow) => {
    const settings: PaymentMethodSetting[] = [];
    for (const country of countries) {
      const enabled = new Set(await enabledMethods(uow, country));
      for (const method of countryProfile(country).paymentMethods) {
        settings.push({ country, method, enabled: enabled.has(method) });
      }
    }
    return ok(settings);
  });
}

export async function setPaymentMethodEnabled(
  _deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<PaymentMethodSetting>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(paymentMethodSchema, input);
  if (!parsed.ok) return parsed;
  const { country, method, enabled } = parsed.value;
  if (!countryProfile(country).paymentMethods.includes(method))
    return fail(BillingErrors.paymentMethodInvalid());

  return withTransaction(ctx, async (uow) => {
    const current = await enabledMethods(uow, country);
    const isEnabled = current.includes(method);
    if (isEnabled === enabled) return ok({ country, method, enabled });
    if (!enabled && current.length <= 1) return fail(BillingErrors.paymentMethodsEmpty(country));
    if (enabled) {
      await uow.tx.disabledPaymentMethod.deleteMany({ where: { country, method } });
    } else {
      await uow.tx.disabledPaymentMethod.create({
        data: { organizationId: ctx.organizationId, country, method, disabledById: ctx.user.id },
      });
    }
    await uow.audit.record({
      action: "UPDATE",
      entityType: "payment_method",
      summary: enabled ? "Forma de pagamento ativada" : "Forma de pagamento desativada",
      changes: { enabled: { before: isEnabled, after: enabled } },
      metadata: { country, method },
    });
    return ok({ country, method, enabled });
  });
}
