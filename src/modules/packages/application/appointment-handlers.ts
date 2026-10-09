import { SCHEDULING_EVENTS, type AppointmentEventPayload } from "@/modules/scheduling";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { DomainEvent, EventBus } from "@/shared/events/event-bus";
import { EventRejection } from "@/shared/events/event-bus";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { PackageErrors } from "../domain/errors";
import { PACKAGES_EVENTS } from "../domain/events";
import type { SessionPackage } from "../domain/package";
import type { PackagesDeps } from "./ports";
import { eventPayload, packageChanges, packageEvent, copyProps } from "./support";

// Reactions to the scheduling events, run synchronously inside the transaction of the booking or
// the status change (ADR-007, ADR-035): the appointment and its package commit or roll back
// together. A link that cannot be made rejects the operation (ADR-034).
const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

type Payload = AppointmentEventPayload;

function payloadOf(event: DomainEvent): Payload {
  return event.payload as unknown as Payload;
}

async function localDate(deps: PackagesDeps, uow: UnitOfWork, payload: Payload): Promise<string> {
  const zone = (await deps.packages.unitTimeZone(uow, payload.unitId)) ?? DEFAULT_TIME_ZONE;
  return dateInTimeZone(new Date(payload.startsAt), zone);
}

async function audit(uow: UnitOfWork, pkg: SessionPackage, summary: string, appointmentId: string) {
  await uow.audit.record({
    action: "UPDATE",
    entityType: "patient_package",
    entityId: pkg.id,
    summary,
    metadata: { appointmentId, used: pkg.snapshot.usedSessions, total: pkg.snapshot.totalSessions },
  });
}

// Links the appointment to the package under the package lock. In "up to the balance" mode (a series)
// a package without room or validity for this occurrence is skipped instead of rejecting.
async function link(
  deps: PackagesDeps,
  uow: UnitOfWork,
  event: DomainEvent,
  packageId: string,
  mode: "STRICT" | "UP_TO_BALANCE",
): Promise<void> {
  const payload = payloadOf(event);
  const pkg = await deps.packages.findById(uow, packageId, { lock: true });
  if (!pkg) throw new EventRejection(PackageErrors.notFound());
  const s = pkg.snapshot;
  if (s.patientId !== payload.patientId || s.serviceId !== payload.serviceId) {
    throw new EventRejection(PackageErrors.wrongPatientOrService());
  }
  const date = await localDate(deps, uow, payload);
  const check = pkg.canLink(date);
  if (!check.ok) {
    const skippable =
      check.error.code === "PACKAGE_BALANCE_EXHAUSTED" || check.error.code === "PACKAGE_EXPIRES_BEFORE";
    if (mode === "UP_TO_BALANCE" && skippable) return;
    throw new EventRejection(check.error);
  }
  await deps.packages.addLink(uow, s.organizationId, {
    id: deps.newId(),
    packageId,
    appointmentId: payload.appointmentId,
    status: "LINKED",
    flagged: false,
    linkedAt: event.occurredAt,
    debitedAt: null,
    closedAt: null,
  });
  await audit(uow, pkg, "Agendamento vinculado ao pacote", payload.appointmentId);
}

async function release(
  deps: PackagesDeps,
  uow: UnitOfWork,
  appointmentId: string,
  now: Date,
  summary: string,
) {
  const found = await deps.packages.findByAppointment(uow, appointmentId, { lock: true });
  if (!found || found.link.status !== "LINKED") return;
  await deps.packages.updateLink(uow, found.link.id, { status: "RELEASED", closedAt: now, flagged: false });
  await audit(uow, found.pkg, summary, appointmentId);
}

async function debit(
  deps: PackagesDeps,
  uow: UnitOfWork,
  appointmentId: string,
  actorUserId: string,
  now: Date,
): Promise<void> {
  const found = await deps.packages.findByAppointment(uow, appointmentId, { lock: true });
  // Idempotent: a link already debited, or no link at all, changes nothing.
  if (!found || found.link.status !== "LINKED") return;
  const before = copyProps(found.pkg);
  found.pkg.debit({ appointmentId, actorUserId, now });
  if ((await deps.packages.save(uow, found.pkg)) === "STALE") throw new EventRejection(PackageErrors.stale());
  await deps.packages.updateLink(uow, found.link.id, { status: "DEBITED", debitedAt: now });
  await uow.audit.record({
    action: "UPDATE",
    entityType: "patient_package",
    entityId: found.pkg.id,
    summary: "Sessão do pacote debitada",
    changes: packageChanges(before, found.pkg.snapshot),
    metadata: { appointmentId },
  });
  await uow.publish(
    packageEvent(PACKAGES_EVENTS.sessionDebited, eventPayload(found.pkg, actorUserId, appointmentId), now),
  );
}

async function restore(
  deps: PackagesDeps,
  uow: UnitOfWork,
  appointmentId: string,
  actorUserId: string,
  now: Date,
): Promise<void> {
  const found = await deps.packages.findByAppointment(uow, appointmentId, { lock: true });
  if (!found || found.link.status !== "DEBITED") return;
  const before = copyProps(found.pkg);
  const outcome = found.pkg.restore({ appointmentId, actorUserId, now });
  if ((await deps.packages.save(uow, found.pkg)) === "STALE") throw new EventRejection(PackageErrors.stale());
  await deps.packages.updateLink(
    uow,
    found.link.id,
    outcome === "LINKED"
      ? { status: "LINKED", debitedAt: null }
      : { status: "RELEASED", debitedAt: null, closedAt: now },
  );
  await uow.audit.record({
    action: "UPDATE",
    entityType: "patient_package",
    entityId: found.pkg.id,
    summary: "Sessão do pacote restaurada",
    changes: packageChanges(before, found.pkg.snapshot),
    metadata: { appointmentId },
  });
  await uow.publish(
    packageEvent(PACKAGES_EVENTS.sessionRestored, eventPayload(found.pkg, actorUserId, appointmentId), now),
  );
}

export async function onAppointmentBooked(
  deps: PackagesDeps,
  event: DomainEvent,
  uow: UnitOfWork,
): Promise<void> {
  const request = payloadOf(event).packageLink;
  if (request?.packageId) await link(deps, uow, event, request.packageId, request.mode);
}

// An edit can link, relink or remove the link, and a change of service removes it.
export async function onAppointmentUpdated(
  deps: PackagesDeps,
  event: DomainEvent,
  uow: UnitOfWork,
): Promise<void> {
  const payload = payloadOf(event);
  const request = payload.packageLink;
  const existing = await deps.packages.findByAppointment(uow, payload.appointmentId, { lock: true });
  const linked = existing?.link.status === "LINKED" ? existing : null;

  if (request && request.packageId === null) {
    if (linked)
      await release(deps, uow, payload.appointmentId, event.occurredAt, "Vínculo com o pacote removido");
    return;
  }
  // A debited session stays with its appointment: it cannot be moved to another package.
  if (request?.packageId && existing && !linked) return;
  if (request?.packageId && linked?.pkg.id !== request.packageId) {
    if (linked)
      await release(deps, uow, payload.appointmentId, event.occurredAt, "Vínculo com o pacote trocado");
    await link(deps, uow, event, request.packageId, request.mode);
    return;
  }
  if (linked && linked.pkg.snapshot.serviceId !== payload.serviceId) {
    await release(deps, uow, payload.appointmentId, event.occurredAt, "Serviço alterado: vínculo removido");
  }
}

// Rescheduling keeps the link, but not past the validity of the package.
export async function onAppointmentRescheduled(
  deps: PackagesDeps,
  event: DomainEvent,
  uow: UnitOfWork,
): Promise<void> {
  const payload = payloadOf(event);
  const found = await deps.packages.findByAppointment(uow, payload.appointmentId, { lock: false });
  if (!found || found.link.status !== "LINKED") return;
  const date = await localDate(deps, uow, payload);
  if (date > found.pkg.snapshot.expiresOn) {
    throw new EventRejection(PackageErrors.expiresBefore(found.pkg.snapshot.expiresOn));
  }
}

export async function onAppointmentCancelled(
  deps: PackagesDeps,
  event: DomainEvent,
  uow: UnitOfWork,
): Promise<void> {
  const payload = payloadOf(event);
  await release(deps, uow, payload.appointmentId, event.occurredAt, "Agendamento cancelado: sessão liberada");
  await deps.packages.clearFlags(uow, payload.appointmentId);
}

// PRD F10: a no-show debits a session only when the organization setting is on.
export async function onAppointmentNoShow(
  deps: PackagesDeps,
  event: DomainEvent,
  uow: UnitOfWork,
): Promise<void> {
  const payload = payloadOf(event);
  if (await deps.packages.debitNoShow(uow)) {
    await debit(deps, uow, payload.appointmentId, payload.actorUserId, event.occurredAt);
  } else {
    await release(deps, uow, payload.appointmentId, event.occurredAt, "Falta: sessão liberada");
  }
}

export async function onAppointmentCompleted(
  deps: PackagesDeps,
  event: DomainEvent,
  uow: UnitOfWork,
): Promise<void> {
  const payload = payloadOf(event);
  await debit(deps, uow, payload.appointmentId, payload.actorUserId, event.occurredAt);
}

export async function onAppointmentCompletionReverted(
  deps: PackagesDeps,
  event: DomainEvent,
  uow: UnitOfWork,
): Promise<void> {
  const payload = payloadOf(event);
  await restore(deps, uow, payload.appointmentId, payload.actorUserId, event.occurredAt);
}

// The front desk flag of an expired or cancelled package disappears once the patient arrives.
export async function onAppointmentCheckedIn(
  deps: PackagesDeps,
  event: DomainEvent,
  uow: UnitOfWork,
): Promise<void> {
  await deps.packages.clearFlags(uow, payloadOf(event).appointmentId);
}

export function subscribePackagesEvents(bus: EventBus<UnitOfWork>, deps: PackagesDeps): void {
  bus.subscribe(SCHEDULING_EVENTS.booked, (event, uow) => onAppointmentBooked(deps, event, uow));
  bus.subscribe(SCHEDULING_EVENTS.updated, (event, uow) => onAppointmentUpdated(deps, event, uow));
  bus.subscribe(SCHEDULING_EVENTS.rescheduled, (event, uow) => onAppointmentRescheduled(deps, event, uow));
  bus.subscribe(SCHEDULING_EVENTS.cancelled, (event, uow) => onAppointmentCancelled(deps, event, uow));
  bus.subscribe(SCHEDULING_EVENTS.markedNoShow, (event, uow) => onAppointmentNoShow(deps, event, uow));
  bus.subscribe(SCHEDULING_EVENTS.completed, (event, uow) => onAppointmentCompleted(deps, event, uow));
  bus.subscribe(SCHEDULING_EVENTS.completionReverted, (event, uow) =>
    onAppointmentCompletionReverted(deps, event, uow),
  );
  bus.subscribe(SCHEDULING_EVENTS.checkedIn, (event, uow) => onAppointmentCheckedIn(deps, event, uow));
}
