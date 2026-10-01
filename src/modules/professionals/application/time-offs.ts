import { diffChanges } from "@/shared/audit/diff";
import { recordDenial } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { checkTimeOff, isTimeOffDeletable, timeOffRange, type TimeOffType } from "../domain/time-offs";
import { ProfessionalsErrors } from "./errors";
import { canManageTimeOff, canViewProfessional } from "./policies";
import type { AffectedAppointment, ProfessionalsDeps } from "./ports";
import { createTimeOffSchema, deleteTimeOffSchema } from "./schemas";

export type TimeOffItem = {
  id: string;
  type: TimeOffType;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  note: string | null;
  createdByName: string | null;
  deletable: boolean;
};

export type TimeOffList = { timeZone: string; canManage: boolean; items: TimeOffItem[] };

async function deny(ctx: RequestContext, professionalId: string) {
  await recordDenial(ctx, "professional:manage-own-time-off", professionalId);
  return fail(CommonErrors.forbidden());
}

export async function listTimeOffs(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  professionalId: string,
  options: { includeEnded?: boolean } = {},
): Promise<Result<TimeOffList>> {
  if (!canViewProfessional(ctx, professionalId)) {
    await recordDenial(ctx, "professional:read-all", professionalId);
    return fail(CommonErrors.forbidden());
  }
  const now = deps.clock();
  const timeZone = await deps.organizationTimeZone(ctx);
  const rows = await withTransaction(ctx, async (uow) =>
    ok(
      await uow.tx.professionalTimeOff.findMany({
        where: { professionalId, ...(options.includeEnded ? {} : { endsAt: { gt: now } }) },
        orderBy: { startsAt: options.includeEnded ? "desc" : "asc" },
      }),
    ),
  );
  if (!rows.ok) return rows;
  const authors = await deps.users.namesOf(
    ctx,
    rows.value.flatMap((row) => (row.createdById ? [row.createdById] : [])),
  );
  return ok({
    timeZone,
    canManage: canManageTimeOff(ctx, professionalId),
    items: rows.value.map((row) => ({
      id: row.id,
      type: row.type as TimeOffType,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      allDay: row.allDay,
      note: row.note,
      createdByName: row.createdById ? (authors.get(row.createdById) ?? null) : null,
      deletable: isTimeOffDeletable(row.endsAt, now),
    })),
  });
}

export type CreateTimeOffResult = { timeOffId: string; affectedAppointments: AffectedAppointment[] };

// PRD F04: professionals create their own time-offs; managers manage all. Appointments in the
// period are not cancelled; they are listed so each one can be rescheduled.
export async function createTimeOff(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<CreateTimeOffResult>> {
  if (!can(ctx, "professional:manage") && !can(ctx, "professional:manage-own-time-off")) {
    return deny(ctx, "");
  }
  const parsed = parseInput(createTimeOffSchema, input);
  if (!parsed.ok) return parsed;
  const { professionalId, type, allDay, startsAt, endsAt, note } = parsed.value;
  if (!canManageTimeOff(ctx, professionalId)) return deny(ctx, professionalId);

  const now = deps.clock();
  const range = timeOffRange({ allDay, startsAt, endsAt }, await deps.organizationTimeZone(ctx));
  switch (checkTimeOff(range, now)) {
    case "TOO_SHORT":
      return fail(
        ProfessionalsErrors.validation({ endsAt: "O fim da ausência deve ser posterior ao início." }),
      );
    case "ENDS_IN_PAST":
      return fail(ProfessionalsErrors.validation({ endsAt: "A ausência não pode terminar no passado." }));
    case "TOO_FAR":
      return fail(ProfessionalsErrors.timeOffTooFar());
    default:
      break;
  }

  const created = await withTransaction(ctx, async (uow) => {
    const professional = await uow.tx.professional.findFirst({ where: { id: professionalId } });
    if (!professional) return fail(ProfessionalsErrors.notFound());
    if (!professional.active) return fail(ProfessionalsErrors.inactive());
    const id = newId();
    const record = { type, startsAt: range.startsAt, endsAt: range.endsAt, allDay, note };
    await uow.tx.professionalTimeOff.create({
      data: { id, organizationId: ctx.organizationId, professionalId, ...record, createdById: ctx.user.id },
    });
    await uow.audit.record({
      action: "CREATE",
      entityType: "professional_time_off",
      entityId: id,
      summary: "Ausência registrada",
      metadata: { professionalId },
      changes: diffChanges(null, record),
    });
    return ok(id);
  });
  if (!created.ok) return created;
  const affectedAppointments = await deps
    .appointments()
    .listInPeriod(ctx.organizationId, professionalId, range.startsAt, range.endsAt);
  return ok({ timeOffId: created.value, affectedAppointments });
}

export async function deleteTimeOff(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ deleted: true }>> {
  if (!can(ctx, "professional:manage") && !can(ctx, "professional:manage-own-time-off")) {
    return deny(ctx, "");
  }
  const parsed = parseInput(deleteTimeOffSchema, input);
  if (!parsed.ok) return parsed;
  const found = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.professionalTimeOff.findFirst({ where: { id: parsed.value.timeOffId } })),
  );
  if (!found.ok) return found;
  const timeOff = found.value;
  if (!timeOff) return fail(ProfessionalsErrors.notFound());
  if (!canManageTimeOff(ctx, timeOff.professionalId)) return deny(ctx, timeOff.professionalId);
  if (!isTimeOffDeletable(timeOff.endsAt, deps.clock())) return fail(ProfessionalsErrors.timeOffEnded());

  return withTransaction(ctx, async (uow) => {
    const removed = await uow.tx.professionalTimeOff.deleteMany({ where: { id: timeOff.id } });
    if (removed.count !== 1) return fail(ProfessionalsErrors.notFound());
    await uow.audit.record({
      action: "DELETE",
      entityType: "professional_time_off",
      entityId: timeOff.id,
      summary: "Ausência excluída",
      metadata: { professionalId: timeOff.professionalId },
      changes: diffChanges<Record<string, unknown>>(
        { type: timeOff.type, startsAt: timeOff.startsAt, endsAt: timeOff.endsAt, note: timeOff.note },
        { type: null, startsAt: null, endsAt: null, note: null },
      ),
    });
    return ok({ deleted: true as const });
  });
}
