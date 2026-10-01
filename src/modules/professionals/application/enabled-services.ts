import { authorize, recordDenial } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { ProfessionalsErrors } from "./errors";
import { canViewProfessional } from "./policies";
import type { ProfessionalsDeps } from "./ports";
import { replaceEnabledServicesSchema } from "./schemas";

export type EnabledServices = {
  serviceIds: string[];
  // Enabled earlier but deactivated in F03 since; shown as "Serviço desativado", dropped on save.
  inactiveServices: { id: string; name: string }[];
};

export type ReplaceEnabledServicesResult = {
  version: number;
  added: number;
  removed: number;
  keptAppointments: number;
};

export async function getEnabledServices(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  professionalId: string,
): Promise<Result<EnabledServices>> {
  if (!canViewProfessional(ctx, professionalId)) {
    await recordDenial(ctx, "professional:read-all", professionalId);
    return fail(CommonErrors.forbidden());
  }
  const rows = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.professionalService.findMany({ where: { professionalId }, select: { serviceId: true } })),
  );
  if (!rows.ok) return rows;
  const active = new Set((await deps.services.listActiveServices(ctx)).map((service) => service.id));
  const enabled = rows.value.map((row) => row.serviceId);
  const inactiveIds = enabled.filter((id) => !active.has(id));
  const names =
    inactiveIds.length > 0 ? await deps.services.namesOf(ctx, inactiveIds) : new Map<string, string>();
  return ok({
    serviceIds: enabled.filter((id) => active.has(id)).sort(),
    inactiveServices: inactiveIds.map((id) => ({ id, name: names.get(id) ?? "" })),
  });
}

// PRD F04: a professional can only be booked for enabled services. Removing a service with future
// appointments is allowed for new bookings and reports how many appointments were kept.
export async function replaceEnabledServices(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ReplaceEnabledServicesResult>> {
  const allowed = await authorize(ctx, "professional:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(replaceEnabledServicesSchema, input);
  if (!parsed.ok) return parsed;
  const { professionalId, version, serviceIds } = parsed.value;

  // PRD F03 cross-feature: only active services can be enabled.
  const active = new Set((await deps.services.listActiveServices(ctx)).map((service) => service.id));
  if (serviceIds.some((id) => !active.has(id))) return fail(ProfessionalsErrors.invalidServices());

  const saved = await withTransaction(ctx, async (uow) => {
    const professional = await uow.tx.professional.findFirst({ where: { id: professionalId } });
    if (!professional) return fail(ProfessionalsErrors.notFound());
    if (!professional.active) return fail(ProfessionalsErrors.inactive());
    const updated = await uow.tx.professional.updateMany({
      where: { id: professionalId, version },
      data: { version: { increment: 1 }, updatedById: ctx.user.id },
    });
    if (updated.count !== 1) return fail(CommonErrors.staleVersion());

    const existing = (
      await uow.tx.professionalService.findMany({ where: { professionalId }, select: { serviceId: true } })
    ).map((row) => row.serviceId);
    const wanted = new Set(serviceIds);
    const removed = existing.filter((id) => !wanted.has(id));
    const added = serviceIds.filter((id) => !existing.includes(id));
    if (removed.length > 0) {
      await uow.tx.professionalService.deleteMany({ where: { professionalId, serviceId: { in: removed } } });
    }
    if (added.length > 0) {
      await uow.tx.professionalService.createMany({
        data: added.map((serviceId) => ({ professionalId, serviceId, organizationId: ctx.organizationId })),
      });
    }
    await uow.audit.record({
      action: "UPDATE",
      entityType: "professional",
      entityId: professionalId,
      summary: "Serviços do profissional alterados",
      changes: { serviceIds: { before: [...existing].sort(), after: [...serviceIds].sort() } },
    });
    return ok({ version: version + 1, added: added.length, removed });
  });
  if (!saved.ok) return saved;

  const removedActive = saved.value.removed;
  const keptAppointments =
    removedActive.length > 0
      ? await deps
          .appointments()
          .countFutureForServices(ctx.organizationId, professionalId, removedActive, deps.clock())
      : 0;
  return ok({
    version: saved.value.version,
    added: saved.value.added,
    removed: removedActive.length,
    keptAppointments,
  });
}
