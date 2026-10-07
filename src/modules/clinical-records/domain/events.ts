// Domain events of the clinical-records module (architecture 5.4). They are published inside the
// transaction; F14 and notifications can subscribe later without changes here. Payloads carry
// IDs only, never clinical text.

// Same shape as the event bus's DomainEvent; the domain may not import shared/events.
export type ClinicalEvent = { type: string; occurredAt: Date; payload: Record<string, unknown> };

export const CLINICAL_RECORDS_EVENTS = {
  noteFinalized: "ClinicalNoteFinalized",
  noteEdited: "ClinicalNoteEdited",
  addendumAdded: "ClinicalNoteAddendumAdded",
  attachmentAdded: "ClinicalAttachmentAdded",
  attachmentMarkedInError: "ClinicalAttachmentMarkedInError",
} as const;

export type ClinicalEventPayload = {
  noteId: string;
  patientId: string;
  appointmentId: string | null;
  professionalId: string;
  // Null when the job acted (automatic finalization).
  actorUserId: string | null;
  automatic?: boolean;
  addendumId?: string;
  attachmentId?: string;
};

export function clinicalEvent(
  type: (typeof CLINICAL_RECORDS_EVENTS)[keyof typeof CLINICAL_RECORDS_EVENTS],
  payload: ClinicalEventPayload,
  now: Date,
): ClinicalEvent {
  return { type, occurredAt: now, payload };
}
