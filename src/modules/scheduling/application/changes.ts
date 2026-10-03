import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { domainError } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { Appointment, AppointmentProps } from "../domain/appointment";
import { SchedulingErrors } from "../domain/errors";
import type { AppointmentEvent } from "../domain/events";
import { auditChanges } from "./book-appointment";
import { staleVersionError } from "./booking";
import { authorizeRead, canSee } from "./policies";
import type { SchedulingDeps } from "./ports";

// Loading and saving an existing appointment with optimistic locking (architecture section 6:
// `version` on appointments), auditing and events in the same transaction.

const STALE_MARKER = "SCHEDULING_STALE_VERSION";

// Appointments outside the reader's scope are reported as not found, so their existence leaks
// nothing (a Professional only sees their own agenda).
export async function loadAppointment(
  deps: SchedulingDeps,
  ctx: RequestContext,
  appointmentId: string,
): Promise<Result<Appointment>> {
  const scope = await authorizeRead(ctx);
  if (!scope.ok) return scope;
  const loaded = await withTransaction(ctx, async (uow) =>
    ok(await deps.appointments.findById(uow, appointmentId)),
  );
  const appointment = loaded.ok ? loaded.value : null;
  if (!appointment || !canSee(scope.value, appointment.snapshot)) return fail(SchedulingErrors.notFound());
  return ok(appointment);
}

export type ChangeOptions = {
  expectedVersion: number;
  before: AppointmentProps;
  metadata?: Record<string, unknown>;
  events: AppointmentEvent[];
};

// Saves inside the caller's transaction. A stale version is returned with a marker that
// `finishChange` turns into the "changed by {author} at {time}" message.
export async function saveChange(
  deps: SchedulingDeps,
  ctx: RequestContext,
  uow: UnitOfWork,
  appointment: Appointment,
  options: ChangeOptions,
): Promise<Result<void>> {
  if (options.before.version !== options.expectedVersion) return fail(domainError(STALE_MARKER, 409));
  const outcome = await deps.appointments.save(uow, appointment, {
    userId: ctx.user.id,
    organizationId: ctx.organizationId,
  });
  if (outcome === "STALE") return fail(domainError(STALE_MARKER, 409));
  if (outcome === "SLOT_TAKEN") return fail(SchedulingErrors.slotTaken());
  const after = appointment.snapshot;
  await uow.audit.record({
    action: "UPDATE",
    entityType: "appointment",
    entityId: after.id,
    changes: auditChanges(options.before, after),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  });
  for (const event of options.events) await uow.publish(event);
  return ok(undefined);
}

// Runs a change in its own transaction and resolves the stale-version message afterwards (the
// author lookup must not run inside the failed transaction).
export async function finishChange<T>(
  deps: SchedulingDeps,
  ctx: RequestContext,
  appointment: { id: string; unitId: string },
  run: (uow: UnitOfWork) => Promise<Result<T>>,
): Promise<Result<T>> {
  const result = await withTransaction(ctx, run);
  if (result.ok || result.error.code !== STALE_MARKER || result.error.params) return result;
  const unit = await deps.directory.unit(ctx, appointment.unitId);
  const zone = unit?.timeZone ?? (await deps.directory.organization(ctx)).timeZone;
  return fail(await staleVersionError(deps, ctx, appointment.id, zone));
}
