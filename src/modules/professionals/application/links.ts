import type { ProfessionalLinks } from "@/modules/identity";
import type { ServiceProfessionals } from "@/modules/services";
import type { SystemContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { ok } from "@/shared/kernel/result";

// Implementations of other modules' ports, registered by the composition root (ADR-007). They run
// for the system, scoped to the given organization: identity calls them while it resolves the
// request context, before a user context exists.
function systemContext(organizationId: string): SystemContext {
  return { kind: "system", requestId: newId(), organizationId, ipAddress: null, userAgent: null };
}

async function read<T>(organizationId: string, query: Parameters<typeof withTransaction<T>>[1]): Promise<T> {
  const result = await withTransaction(systemContext(organizationId), query);
  if (!result.ok) throw new Error("Unexpected failure reading professionals");
  return result.value;
}

// PRD F01: a linked professional profile grants Professional permissions; only active
// professionals count (spec F04 section 3).
export const professionalLinks: ProfessionalLinks = {
  async findLinkedProfessionalId(organizationId, userId) {
    return read(organizationId, async (uow) => {
      const row = await uow.tx.professional.findFirst({
        where: { linkedUserId: userId, active: true },
        select: { id: true },
      });
      return ok(row?.id ?? null);
    });
  },
  async linkedProfessionals(organizationId, userIds) {
    if (userIds.length === 0) return new Map();
    return read(organizationId, async (uow) => {
      const rows = await uow.tx.professional.findMany({
        where: { linkedUserId: { in: userIds }, active: true },
        select: { id: true, fullName: true, displayName: true, linkedUserId: true },
      });
      return ok(
        new Map(
          rows.flatMap((row) =>
            row.linkedUserId
              ? [[row.linkedUserId, { id: row.id, name: row.displayName ?? row.fullName }]]
              : [],
          ),
        ),
      );
    });
  },
};

// PRD F03 "Profissionais" column: active professionals enabled for each service.
export const serviceProfessionals: ServiceProfessionals = {
  async countByService(organizationId, serviceIds) {
    if (serviceIds.length === 0) return new Map();
    return read(organizationId, async (uow) => {
      const rows = await uow.tx.professionalService.groupBy({
        by: ["serviceId"],
        where: { serviceId: { in: serviceIds }, professional: { active: true } },
        _count: { _all: true },
      });
      return ok(new Map(rows.map((row) => [row.serviceId, row._count._all])));
    });
  },
};
