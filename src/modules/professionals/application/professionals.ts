import { diffChanges } from "@/shared/audit/diff";
import { authorize, recordDenial } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { isValidCpf } from "@/shared/kernel/cpf";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { nextDefaultColor, type PaletteColor } from "@/shared/kernel/palette";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { formatRegistration, initialsOf, type CouncilType } from "../domain/council";
import { MAX_ACTIVE_PROFESSIONALS } from "../domain/limits";
import { violatedConstraint } from "./db-values";
import { ProfessionalsErrors } from "./errors";
import { canViewProfessional } from "./policies";
import type { ProfessionalsDeps } from "./ports";
import {
  createProfessionalSchema,
  listProfessionalsSchema,
  setProfessionalActiveSchema,
  updateProfessionalSchema,
} from "./schemas";

export type ProfessionalListItem = {
  id: string;
  fullName: string;
  displayName: string;
  initials: string;
  color: PaletteColor;
  specialty: string | null;
  registration: string;
  unitNames: string[];
  enabledServices: number;
  active: boolean;
};

export type ProfessionalDetails = {
  id: string;
  fullName: string;
  displayName: string | null;
  specialty: string | null;
  councilType: CouncilType;
  councilOtherName: string | null;
  councilNumber: string | null;
  councilState: string | null;
  registration: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  color: PaletteColor;
  linkedUser: { id: string; name: string; linkable: boolean } | null;
  active: boolean;
  version: number;
};

export type SaveProfessionalResult = { professionalId: string; version: number };

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export async function today(deps: ProfessionalsDeps, ctx: RequestContext): Promise<string> {
  return dateInTimeZone(deps.clock(), await deps.organizationTimeZone(ctx));
}

// At most 100 active professionals, so the list is filtered in memory with accent-insensitive
// matching, as F01 does for users.
export async function listProfessionals(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ProfessionalListItem[]>> {
  const allowed = await authorize(ctx, "professional:read-all");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(listProfessionalsSchema, input ?? {});
  if (!parsed.ok) return parsed;
  const { search, status } = parsed.value;
  const [date, activeServices, units] = await Promise.all([
    today(deps, ctx),
    deps.services.listActiveServices(ctx),
    deps.units.listUnits(ctx, { activeOnly: false }),
  ]);
  const activeServiceIds = new Set(activeServices.map((service) => service.id));
  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]));
  const day = new Date(`${date}T00:00:00.000Z`);

  return withTransaction(ctx, async (uow) => {
    const rows = await uow.tx.professional.findMany({
      where: status === "all" ? {} : { active: status === "active" },
      include: {
        services: { select: { serviceId: true } },
        schedules: {
          where: { validFrom: { lte: day }, OR: [{ validUntil: null }, { validUntil: { gte: day } }] },
          select: { intervals: { select: { unitId: true } } },
        },
      },
    });
    const term = search ? normalize(search) : "";
    const items = rows
      .map((row) => {
        const displayName = row.displayName ?? row.fullName;
        const unitIds = new Set(row.schedules.flatMap((schedule) => schedule.intervals.map((i) => i.unitId)));
        return {
          id: row.id,
          fullName: row.fullName,
          displayName,
          initials: initialsOf(row.fullName),
          color: row.color as PaletteColor,
          specialty: row.specialty,
          registration: formatRegistration({
            type: row.councilType as CouncilType,
            otherName: row.councilOtherName,
            number: row.councilNumber,
            state: row.councilState,
          }),
          unitNames: [...unitIds]
            .map((id) => unitNames.get(id) ?? "")
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "pt-BR")),
          enabledServices: row.services.filter((service) => activeServiceIds.has(service.serviceId)).length,
          active: row.active,
        };
      })
      .filter((item) => !term || normalize(`${item.fullName} ${item.displayName}`).includes(term))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
    return ok(items);
  });
}

export async function getProfessional(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  professionalId: string,
): Promise<Result<ProfessionalDetails>> {
  if (!canViewProfessional(ctx, professionalId)) {
    await recordDenial(ctx, "professional:read-all", professionalId);
    return fail(CommonErrors.forbidden());
  }
  const loaded = await withTransaction(ctx, async (uow) => {
    const row = await uow.tx.professional.findFirst({ where: { id: professionalId } });
    return row ? ok(row) : fail(ProfessionalsErrors.notFound());
  });
  if (!loaded.ok) return loaded;
  const row = loaded.value;

  let linkedUser: ProfessionalDetails["linkedUser"] = null;
  if (row.linkedUserId) {
    const [linkable, names] = await Promise.all([
      deps.users.listLinkableUsers(ctx),
      deps.users.namesOf(ctx, [row.linkedUserId]),
    ]);
    linkedUser = {
      id: row.linkedUserId,
      name: names.get(row.linkedUserId) ?? "",
      linkable: linkable.some((user) => user.id === row.linkedUserId),
    };
  }
  const councilType = row.councilType as CouncilType;
  return ok({
    id: row.id,
    fullName: row.fullName,
    displayName: row.displayName,
    specialty: row.specialty,
    councilType,
    councilOtherName: row.councilOtherName,
    councilNumber: row.councilNumber,
    councilState: row.councilState,
    registration: formatRegistration({
      type: councilType,
      otherName: row.councilOtherName,
      number: row.councilNumber,
      state: row.councilState,
    }),
    cpf: row.cpf,
    phone: row.phone,
    email: row.email,
    color: row.color as PaletteColor,
    linkedUser,
    active: row.active,
    version: row.version,
  });
}

// Default color for "Novo profissional": the first one no active professional uses yet.
export async function suggestProfessionalColor(ctx: RequestContext): Promise<Result<PaletteColor>> {
  const allowed = await authorize(ctx, "professional:manage");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const used = await uow.tx.professional.findMany({ where: { active: true }, select: { color: true } });
    return ok(nextDefaultColor(used.map((row) => row.color)));
  });
}

type ProfessionalFields = {
  fullName: string;
  displayName: string | null;
  specialty: string | null;
  councilType: CouncilType;
  councilOtherName: string | null;
  councilNumber: string | null;
  councilState: string | null;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  color: PaletteColor;
  linkedUserId: string | null;
};

// Friendly checks before the unique indexes, which remain the guarantee under concurrency.
async function findUniquenessError(uow: UnitOfWork, fields: ProfessionalFields, exceptId?: string) {
  const notSelf = exceptId ? { id: { not: exceptId } } : {};
  if (fields.cpf && (await uow.tx.professional.findFirst({ where: { cpf: fields.cpf, ...notSelf } }))) {
    return ProfessionalsErrors.cpfTaken();
  }
  if (
    fields.councilType !== "NONE" &&
    (await uow.tx.professional.findFirst({
      where: {
        councilType: fields.councilType,
        councilOtherName: fields.councilOtherName,
        councilState: fields.councilState,
        councilNumber: fields.councilNumber,
        ...notSelf,
      },
    }))
  ) {
    return ProfessionalsErrors.councilTaken();
  }
  if (
    fields.linkedUserId &&
    (await uow.tx.professional.findFirst({ where: { linkedUserId: fields.linkedUserId, ...notSelf } }))
  ) {
    return ProfessionalsErrors.userAlreadyLinked();
  }
  return null;
}

function uniqueViolation(error: unknown) {
  const text = violatedConstraint(error);
  if (text.includes("uq_professional_linked_user") || text.includes("linked_user_id")) {
    return ProfessionalsErrors.userAlreadyLinked();
  }
  if (text.includes("uq_professional_org_cpf")) return ProfessionalsErrors.cpfTaken();
  if (text.includes("uq_professional_org_council")) return ProfessionalsErrors.councilTaken();
  return null;
}

async function checkFields(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  fields: ProfessionalFields,
  currentLinkedUserId: string | null,
) {
  if (fields.cpf && !isValidCpf(fields.cpf)) return ProfessionalsErrors.invalidCpf();
  // PRD F01/F04: only active Professional, Manager or Administrator users can be linked. An
  // existing link is kept even when the user no longer qualifies (it then grants nothing).
  if (fields.linkedUserId && fields.linkedUserId !== currentLinkedUserId) {
    const linkable = await deps.users.listLinkableUsers(ctx);
    if (!linkable.some((user) => user.id === fields.linkedUserId))
      return ProfessionalsErrors.userNotLinkable();
  }
  return null;
}

export async function createProfessional(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<SaveProfessionalResult>> {
  const allowed = await authorize(ctx, "professional:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createProfessionalSchema, input);
  if (!parsed.ok) return parsed;
  const fields = parsed.value;
  const invalid = await checkFields(deps, ctx, fields, null);
  if (invalid) return fail(invalid);

  try {
    return await withTransaction(ctx, async (uow) => {
      if ((await uow.tx.professional.count({ where: { active: true } })) >= MAX_ACTIVE_PROFESSIONALS) {
        return fail(ProfessionalsErrors.limit());
      }
      const taken = await findUniquenessError(uow, fields);
      if (taken) return fail(taken);
      const id = newId();
      await uow.tx.professional.create({
        data: { id, organizationId: ctx.organizationId, ...fields, createdById: ctx.user.id },
      });
      await uow.audit.record({
        action: "CREATE",
        entityType: "professional",
        entityId: id,
        summary: "Profissional cadastrado",
        changes: diffChanges(null, fields),
      });
      return ok({ professionalId: id, version: 1 });
    });
  } catch (error) {
    const mapped = uniqueViolation(error);
    if (mapped) return fail(mapped);
    throw error;
  }
}

export async function updateProfessional(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<SaveProfessionalResult>> {
  const allowed = await authorize(ctx, "professional:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(updateProfessionalSchema, input);
  if (!parsed.ok) return parsed;
  const { professionalId, version, ...fields } = parsed.value;

  const current = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.professional.findFirst({ where: { id: professionalId } })),
  );
  if (!current.ok) return current;
  const before = current.value;
  if (!before) return fail(ProfessionalsErrors.notFound());
  if (!before.active) return fail(ProfessionalsErrors.inactive());
  const invalid = await checkFields(deps, ctx, fields, before.linkedUserId);
  if (invalid) return fail(invalid);

  try {
    return await withTransaction(ctx, async (uow) => {
      const taken = await findUniquenessError(uow, fields, professionalId);
      if (taken) return fail(taken);
      const updated = await uow.tx.professional.updateMany({
        where: { id: professionalId, version },
        data: { ...fields, version: { increment: 1 }, updatedById: ctx.user.id },
      });
      if (updated.count !== 1) return fail(CommonErrors.staleVersion());
      await uow.audit.record({
        action: "UPDATE",
        entityType: "professional",
        entityId: professionalId,
        summary: "Profissional alterado",
        changes: diffChanges(before, fields),
      });
      return ok({ professionalId, version: version + 1 });
    });
  } catch (error) {
    const mapped = uniqueViolation(error);
    if (mapped) return fail(mapped);
    throw error;
  }
}

export async function setProfessionalActive(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ active: boolean }>> {
  const allowed = await authorize(ctx, "professional:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setProfessionalActiveSchema, input);
  if (!parsed.ok) return parsed;
  const { professionalId, active } = parsed.value;
  const now = deps.clock();

  if (!active) {
    // PRD F04: deactivation is blocked while future non-cancelled appointments exist.
    const future = await deps.appointments().countFuture(ctx.organizationId, professionalId, now);
    if (future > 0) return fail(ProfessionalsErrors.hasFutureAppointments(future));
  }

  return withTransaction(ctx, async (uow) => {
    const row = await uow.tx.professional.findFirst({ where: { id: professionalId } });
    if (!row) return fail(ProfessionalsErrors.notFound());
    if (row.active === active) return ok({ active });
    if (
      active &&
      (await uow.tx.professional.count({ where: { active: true } })) >= MAX_ACTIVE_PROFESSIONALS
    ) {
      return fail(ProfessionalsErrors.limit());
    }
    await uow.tx.professional.update({
      where: { id: professionalId },
      data: {
        active,
        deactivatedAt: active ? null : now,
        version: { increment: 1 },
        updatedById: ctx.user.id,
      },
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "professional",
      entityId: professionalId,
      summary: active ? "Profissional reativado" : "Profissional desativado",
      changes: { active: { before: !active, after: active } },
    });
    return ok({ active });
  });
}
