// Domain events of the documents module (architecture 5.4). They are published inside the
// transaction; F14 and notifications can subscribe later without changes here. Payloads carry IDs
// only, never titles or file names.

// Same shape as the event bus's DomainEvent; the domain may not import shared/events.
export type DocumentEvent = { type: string; occurredAt: Date; payload: Record<string, unknown> };

export const DOCUMENTS_EVENTS = {
  added: "PatientDocumentAdded",
  updated: "PatientDocumentUpdated",
  archived: "PatientDocumentArchived",
  restored: "PatientDocumentRestored",
} as const;

export type DocumentEventPayload = {
  documentId: string;
  patientId: string;
  kind: "UPLOADED" | "GENERATED";
  clinical: boolean;
  actorUserId: string;
};

export function documentEvent(
  type: (typeof DOCUMENTS_EVENTS)[keyof typeof DOCUMENTS_EVENTS],
  payload: DocumentEventPayload,
  now: Date,
): DocumentEvent {
  return { type, occurredAt: now, payload };
}
