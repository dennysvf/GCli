import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { Charge } from "../domain/charge";
import { BillingErrors } from "../domain/errors";
import { BILLING_EVENTS } from "../domain/events";
import type { ChargeOrigin } from "../domain/status";
import type { BillingDeps } from "./ports";
import { createChargeSchema, createPackageChargeSchema } from "./schemas";
import { billingEvent, chargeChanges, chargeEventPayload } from "./support";
import { viewOf, type ChargeView } from "./views";

type NewChargeInput = {
  patientId: string;
  unitId: string;
  serviceId?: string | undefined;
  description?: string | undefined;
  grossMinor: number;
  professionalId?: string | undefined;
  packageId?: string | undefined;
};

// Manual charges (PRD F09): a service with an editable price, or a free description, for a patient
// in a unit; the unit sets the currency. Package sales (F10) use the same path with the origin
// `PACKAGE` and their package ID.
async function createCharge(
  deps: BillingDeps,
  ctx: RequestContext,
  origin: ChargeOrigin,
  data: NewChargeInput,
): Promise<Result<ChargeView>> {
  const [patient, unit, service, professionals] = await Promise.all([
    deps.directory.patient(ctx, data.patientId),
    deps.directory.unit(ctx, data.unitId),
    data.serviceId ? deps.directory.service(ctx, data.serviceId) : Promise.resolve(null),
    data.professionalId
      ? deps.directory.professionalNames(ctx, [data.professionalId])
      : Promise.resolve(null),
  ]);
  if (!patient.ok) return fail(BillingErrors.patientInvalid());
  if (!unit || !unit.active) return fail(BillingErrors.unitRequired());
  if (data.serviceId && (!service || !service.active)) return fail(BillingErrors.serviceInvalid());
  if (data.professionalId && !professionals?.has(data.professionalId)) {
    return fail(BillingErrors.serviceInvalid());
  }

  const now = deps.clock();
  const created = await withTransaction(ctx, async (uow) => {
    const built = Charge.create({
      id: deps.newId(),
      organizationId: ctx.organizationId,
      number: await deps.charges.nextNumber(uow, ctx.organizationId, now),
      patientId: data.patientId,
      origin,
      packageId: data.packageId ?? null,
      serviceId: data.serviceId ?? null,
      description: data.description ?? null,
      professionalId: data.professionalId ?? null,
      unitId: data.unitId,
      currency: unit.currency,
      grossMinor: data.grossMinor,
      createdById: ctx.user.id,
      now,
    });
    if (!built.ok) return built;
    const charge = built.value;
    await deps.charges.insert(uow, charge);
    await uow.audit.record({
      action: "CREATE",
      entityType: "charge",
      entityId: charge.id,
      summary: origin === "PACKAGE" ? "Cobrança de pacote criada" : "Cobrança manual criada",
      changes: chargeChanges(null, charge.snapshot),
      metadata: { number: charge.snapshot.number, origin },
    });
    await uow.publish(
      billingEvent(BILLING_EVENTS.chargeCreated, chargeEventPayload(charge, ctx.user.id), now),
    );
    return ok(charge);
  });
  if (!created.ok) return created;
  return ok(await viewOf(deps.directory, ctx, created.value));
}

export async function createManualCharge(
  deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ChargeView>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createChargeSchema, input);
  if (!parsed.ok) return parsed;
  return createCharge(deps, ctx, "MANUAL", parsed.value);
}

// For F10: the charge of a package sale.
export async function createPackageCharge(
  deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ChargeView>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createPackageChargeSchema, input);
  if (!parsed.ok) return parsed;
  if (!parsed.value.serviceId && !parsed.value.description) return fail(BillingErrors.serviceInvalid());
  return createCharge(deps, ctx, "PACKAGE", parsed.value);
}
