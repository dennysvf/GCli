import { authorize } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { PackageErrors } from "../domain/errors";
import { PACKAGES_EVENTS } from "../domain/events";
import { SessionPackage } from "../domain/package";
import type { ChargeRef, PackagesDeps } from "./ports";
import { sellSchema } from "./schemas";
import { eventPayload, packageChanges, packageEvent } from "./support";
import { packageView, type PackageView } from "./views";

export type SaleResult = { package: PackageView; charge: ChargeRef };

// PRD F10: the package and its charge (origin "Pacote") are written in one transaction; if the
// charge fails, nothing is saved. A price below the template price becomes a discount on the
// charge, under the F09 rules (reason above 10%, manager approval above 20%).
export async function sellPackage(
  deps: PackagesDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<SaleResult>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(sellSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;

  const [patient, unit] = await Promise.all([
    deps.directory.patient(ctx, data.patientId),
    deps.directory.unit(ctx, data.unitId),
  ]);
  if (!patient.ok) return patient;
  if (!unit || !unit.active) return fail(PackageErrors.templateNotFound());

  // The approver's PIN is verified in its own transaction, so wrong attempts are counted.
  let approverUserId: string | null = null;
  if (data.approval && !can(ctx, "billing:approve")) {
    const verified = await deps.billing.verifyApproval(ctx, data.approval.approverUserId, data.approval.pin);
    if (!verified.ok) return verified;
    approverUserId = verified.value.approverUserId;
  }

  const now = deps.clock();
  let outcome: Result<{ pkg: SessionPackage; charge: ChargeRef; serviceName: string }>;
  try {
    outcome = await withTransaction(ctx, async (uow) => {
      const template = await uow.tx.packageTemplate.findFirst({
        where: { id: data.templateId, active: true },
        include: { prices: true },
      });
      if (!template) return fail(PackageErrors.templateNotFound());
      const price = template.prices.find((item) => item.currency === unit.currency);
      if (!price) return fail(PackageErrors.noPriceForCurrency(unit.currency));
      const templatePrice = Number(price.amountMinor);
      if (data.priceMinor > templatePrice) return fail(PackageErrors.priceAboveTemplate());
      const service = await deps.directory.service(ctx, template.serviceId);
      if (!service || !service.active) return fail(PackageErrors.serviceInvalid());

      const packageId = newId();
      const charge = await deps.billing.createCharge(ctx, uow, {
        patientId: data.patientId,
        unitId: unit.id,
        packageId,
        serviceId: template.serviceId,
        grossMinor: templatePrice,
      });
      // PRD F10: a failed charge rolls the whole sale back.
      if (!charge.ok) return fail(PackageErrors.saleFailed());

      let chargeRef = charge.value;
      if (data.priceMinor < templatePrice) {
        const discounted = await deps.billing.setDiscount(ctx, uow, {
          chargeId: charge.value.id,
          discountMinor: templatePrice - data.priceMinor,
          reason: data.discountReason ?? null,
          approverUserId,
          submitForApproval: data.submitForApproval ?? false,
        });
        if (!discounted.ok) return discounted;
        chargeRef = { ...chargeRef, status: discounted.value.status, netMinor: discounted.value.netMinor };
      }

      const pkg = SessionPackage.sell({
        id: packageId,
        organizationId: ctx.organizationId,
        patientId: data.patientId,
        templateId: template.id,
        name: template.name,
        serviceId: template.serviceId,
        totalSessions: template.sessions,
        unitId: unit.id,
        currency: unit.currency,
        priceMinor: data.priceMinor,
        soldOn: dateInTimeZone(now, unit.timeZone),
        validityDays: template.validityDays,
        chargeId: chargeRef.id,
        soldById: ctx.user.id,
        now,
      });
      await deps.packages.insert(uow, pkg);
      await uow.audit.record({
        action: "CREATE",
        entityType: "patient_package",
        entityId: pkg.id,
        summary: "Pacote vendido",
        changes: packageChanges(null, pkg.snapshot),
        metadata: {
          chargeId: chargeRef.id,
          chargeNumber: chargeRef.number,
          priceMinor: data.priceMinor,
          templatePriceMinor: templatePrice,
          currency: unit.currency,
        },
      });
      await uow.publish(packageEvent(PACKAGES_EVENTS.sold, eventPayload(pkg, ctx.user.id), now));
      return ok({ pkg, charge: chargeRef, serviceName: service.name });
    });
  } catch {
    // Anything unexpected inside the transaction rolled it back; the user gets the PRD message.
    return fail(PackageErrors.saleFailed());
  }
  if (!outcome.ok) return outcome;
  const { pkg, charge, serviceName } = outcome.value;
  return ok({ package: packageView(pkg, { serviceName, chargeStatus: charge.status }), charge });
}
