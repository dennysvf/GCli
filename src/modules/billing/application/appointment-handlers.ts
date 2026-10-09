import { SCHEDULING_EVENTS } from "@/modules/scheduling";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { DomainEvent, EventBus } from "@/shared/events/event-bus";
import { EventRejection } from "@/shared/events/event-bus";
import { Charge } from "../domain/charge";
import { BillingErrors } from "../domain/errors";
import { BILLING_EVENTS } from "../domain/events";
import { billingEvent, chargeChanges, chargeEventPayload } from "./support";
import type { BillingDeps } from "./ports";

// Reactions to the scheduling events, run synchronously inside the transaction of the status
// change (ADR-007): the check-in and its charge commit or roll back together.
type AppointmentPayload = {
  appointmentId: string;
  patientId: string;
  professionalId: string;
  serviceId: string;
  unitId: string;
  priceMinor: number;
  currency: string;
  actorUserId: string;
};

function payloadOf(event: DomainEvent): AppointmentPayload {
  return event.payload as unknown as AppointmentPayload;
}

// PRD F09: the check-in creates one "Em aberto" charge with the appointment's price snapshot,
// unless the price is zero or a package covers the appointment (F10, through the exemption port).
export async function onAppointmentCheckedIn(
  deps: BillingDeps,
  event: DomainEvent,
  uow: UnitOfWork,
): Promise<void> {
  const payload = payloadOf(event);
  if (!(payload.priceMinor > 0)) return;
  const appointment = await uow.tx.appointment.findFirst({
    where: { id: payload.appointmentId },
    select: { organizationId: true },
  });
  if (!appointment) return;
  const organizationId = appointment.organizationId;

  // A check-in repeated after an undo finds no live charge (the undo deleted it); a retry of the
  // same event finds the one that exists and does nothing.
  const existing = await deps.charges.findLiveByAppointment(uow, organizationId, payload.appointmentId, {
    lock: true,
  });
  if (existing) return;
  const exempt = await deps.exemptions().isExempt(uow, {
    organizationId,
    appointmentId: payload.appointmentId,
    patientId: payload.patientId,
    serviceId: payload.serviceId,
  });
  if (exempt) return;

  const created = Charge.create({
    id: deps.newId(),
    organizationId,
    number: await deps.charges.nextNumber(uow, organizationId, event.occurredAt),
    patientId: payload.patientId,
    origin: "APPOINTMENT",
    appointmentId: payload.appointmentId,
    serviceId: payload.serviceId,
    professionalId: payload.professionalId,
    unitId: payload.unitId,
    currency: payload.currency,
    grossMinor: payload.priceMinor,
    createdById: payload.actorUserId,
    now: event.occurredAt,
  });
  if (!created.ok) return;
  const charge = created.value;
  await deps.charges.insert(uow, charge);
  await uow.audit.record({
    action: "CREATE",
    entityType: "charge",
    entityId: charge.id,
    summary: "Cobrança criada na chegada",
    changes: chargeChanges(null, charge.snapshot),
    metadata: { number: charge.snapshot.number, origin: "APPOINTMENT", appointmentId: payload.appointmentId },
  });
  await uow.publish(
    billingEvent(
      BILLING_EVENTS.chargeCreated,
      chargeEventPayload(charge, payload.actorUserId),
      event.occurredAt,
    ),
  );
}

// PRD F09: undoing the check-in removes the charge only if it never had a payment. With payments
// the handler refuses the undo (ADR-034), under the lock that payments take.
export async function onAppointmentCheckInUndone(
  deps: BillingDeps,
  event: DomainEvent,
  uow: UnitOfWork,
): Promise<void> {
  const payload = payloadOf(event);
  const appointment = await uow.tx.appointment.findFirst({
    where: { id: payload.appointmentId },
    select: { organizationId: true },
  });
  if (!appointment) return;
  const charge = await deps.charges.findLiveByAppointment(
    uow,
    appointment.organizationId,
    payload.appointmentId,
    {
      lock: true,
    },
  );
  if (!charge) return;
  if (!charge.canBeDeletedOnUndo) throw new EventRejection(BillingErrors.checkInUndoHasPayments());

  await deps.charges.delete(uow, charge.id);
  await uow.audit.record({
    action: "DELETE",
    entityType: "charge",
    entityId: charge.id,
    summary: "Cobrança removida ao desfazer a chegada",
    metadata: {
      number: charge.snapshot.number,
      appointmentId: payload.appointmentId,
      grossMinor: charge.snapshot.grossMinor,
      discountMinor: charge.snapshot.discountMinor,
      currency: charge.snapshot.currency,
    },
  });
  await uow.publish(
    billingEvent(
      BILLING_EVENTS.chargeDeleted,
      chargeEventPayload(charge, payload.actorUserId),
      event.occurredAt,
    ),
  );
}

export function subscribeBillingEvents(bus: EventBus<UnitOfWork>, deps: BillingDeps): void {
  bus.subscribe(SCHEDULING_EVENTS.checkedIn, (event, uow) => onAppointmentCheckedIn(deps, event, uow));
  bus.subscribe(SCHEDULING_EVENTS.checkInUndone, (event, uow) =>
    onAppointmentCheckInUndone(deps, event, uow),
  );
}
