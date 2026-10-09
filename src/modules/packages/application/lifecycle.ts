import { authorize } from "@/shared/authz/guard";
import type { RequestContext, SystemContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { PackageErrors } from "../domain/errors";
import { PACKAGES_EVENTS } from "../domain/events";
import type { PackagesDeps } from "./ports";
import { cancelSchema, extendSchema } from "./schemas";
import { copyProps, eventPayload, mutatePackage, packageChanges, packageEvent } from "./support";
import { packageView, type PackageView } from "./views";

async function viewOf(deps: PackagesDeps, ctx: RequestContext, pkg: Parameters<typeof packageView>[0]) {
  const s = "snapshot" in pkg ? pkg.snapshot : pkg;
  const [service, statuses] = await Promise.all([
    deps.directory.service(ctx, s.serviceId),
    deps.billing.chargeStatuses(ctx, [s.chargeId]),
  ]);
  return packageView(pkg, {
    serviceName: service?.name ?? "",
    chargeStatus: statuses.get(s.chargeId) ?? null,
  });
}

// PRD F10: a Manager or Administrator extends the validity (up to 365 days in total) with a reason.
export async function extendPackage(
  deps: PackagesDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<PackageView>> {
  const allowed = await authorize(ctx, "billing:approve");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(extendSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const now = deps.clock();
  const changed = await mutatePackage(
    deps,
    ctx,
    data.packageId,
    { expectedVersion: data.version },
    async (uow, pkg) => {
      const before = copyProps(pkg);
      const extended = pkg.extend({ days: data.days, reason: data.reason, userId: ctx.user.id, now });
      if (!extended.ok) return extended;
      await uow.audit.record({
        action: "UPDATE",
        entityType: "patient_package",
        entityId: pkg.id,
        summary: "Validade do pacote prorrogada",
        changes: packageChanges(before, pkg.snapshot),
        metadata: { days: data.days, reason: data.reason },
      });
      await uow.publish(packageEvent(PACKAGES_EVENTS.extended, eventPayload(pkg, ctx.user.id), now));
      return ok(undefined);
    },
  );
  if (!changed.ok) return changed;
  return ok(await viewOf(deps, ctx, changed.value.pkg));
}

export type CancelResult = { package: PackageView; chargeVoided: boolean; chargeId: string };

// PRD F10: the remaining balance is zeroed and the open links are released after a confirmation. The
// sale charge is voided in the same transaction when it has no payments; otherwise the F09 refund
// flow takes over.
export async function cancelPackage(
  deps: PackagesDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<CancelResult>> {
  const allowed = await authorize(ctx, "billing:approve");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(cancelSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const now = deps.clock();
  const changed = await mutatePackage(
    deps,
    ctx,
    data.packageId,
    { expectedVersion: data.version },
    async (uow, pkg) => {
      const links = await deps.packages.openLinks(uow, pkg.id);
      if (links.length > 0 && !data.confirmUnlink)
        return fail(PackageErrors.hasLinkedAppointments(links.length));
      const before = copyProps(pkg);
      const cancelled = pkg.cancel({ reason: data.reason, userId: ctx.user.id, now });
      if (!cancelled.ok) return cancelled;
      for (const link of links) {
        await deps.packages.updateLink(uow, link.id, {
          status: "UNLINKED_CANCELLED",
          flagged: true,
          closedAt: now,
        });
      }
      const voided = await deps.billing.voidCharge(ctx, uow, {
        chargeId: pkg.snapshot.chargeId,
        reason: data.reason,
      });
      if (!voided.ok) return voided;
      await uow.audit.record({
        action: "UPDATE",
        entityType: "patient_package",
        entityId: pkg.id,
        summary: "Pacote cancelado",
        changes: packageChanges(before, pkg.snapshot),
        metadata: { reason: data.reason, unlinked: links.length, chargeVoided: voided.value.voided },
      });
      await uow.publish(packageEvent(PACKAGES_EVENTS.cancelled, eventPayload(pkg, ctx.user.id), now));
      return ok({ chargeVoided: voided.value.voided });
    },
  );
  if (!changed.ok) return changed;
  const { pkg, value } = changed.value;
  return ok({
    package: await viewOf(deps, ctx, pkg),
    chargeVoided: value.chargeVoided,
    chargeId: pkg.snapshot.chargeId,
  });
}

function systemContext(organizationId: string): SystemContext {
  return { kind: "system", requestId: newId(), organizationId, ipAddress: null, userAgent: null };
}

// The daily job (PRD F10, architecture 5.5): packages past their last day expire, their remaining
// sessions are forfeited and their open links are unlinked and flagged for the front desk. Each
// package is handled in its own transaction under its lock, so a retry skips what already ran.
export async function expirePackages(
  deps: PackagesDeps,
  input: { organizationId: string; timeZone: string; now?: Date },
): Promise<Result<{ expired: number }>> {
  const now = input.now ?? deps.clock();
  const today = dateInTimeZone(now, input.timeZone);
  const ctx = systemContext(input.organizationId);

  const ids = await withTransaction(ctx, async (uow) => {
    const already = await uow.tx.packageExpirationRun.findFirst({
      where: { runOn: new Date(`${today}T00:00:00Z`) },
    });
    return ok(already ? [] : await deps.packages.expirable(uow, today));
  });
  if (!ids.ok) return ids;

  let expired = 0;
  for (const packageId of ids.value) {
    const result = await withTransaction(ctx, async (uow) => {
      const pkg = await deps.packages.findById(uow, packageId, { lock: true });
      if (!pkg || pkg.snapshot.status !== "ACTIVE" || pkg.snapshot.expiresOn >= today) return ok(false);
      const before = copyProps(pkg);
      const links = await deps.packages.openLinks(uow, pkg.id);
      const done = pkg.expire({ now });
      if (!done.ok) return ok(false);
      if ((await deps.packages.save(uow, pkg)) === "STALE") return fail(PackageErrors.stale());
      for (const link of links) {
        await deps.packages.updateLink(uow, link.id, {
          status: "UNLINKED_EXPIRED",
          flagged: true,
          closedAt: now,
        });
      }
      await uow.audit.record({
        action: "UPDATE",
        entityType: "patient_package",
        entityId: pkg.id,
        summary: "Pacote expirado",
        changes: packageChanges(before, pkg.snapshot),
        metadata: { forfeited: done.value.forfeited, unlinked: links.length },
      });
      await uow.publish(packageEvent(PACKAGES_EVENTS.expired, eventPayload(pkg, null), now));
      return ok(true);
    });
    if (result.ok && result.value) expired += 1;
  }

  await withTransaction(ctx, async (uow) => {
    await uow.tx.packageExpirationRun.upsert({
      where: {
        organizationId_runOn: { organizationId: input.organizationId, runOn: new Date(`${today}T00:00:00Z`) },
      },
      create: { organizationId: input.organizationId, runOn: new Date(`${today}T00:00:00Z`) },
      update: {},
    });
    return ok(undefined);
  });
  return ok({ expired });
}
