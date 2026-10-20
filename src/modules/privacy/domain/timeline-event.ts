// The kinds of events of the patient timeline and the groups the filter offers (PRD F14
// Capabilities, spec decision D2). An appointment is one event at its start, carrying its status
// history, so a page is not flooded by status changes.

export const TIMELINE_GROUPS = [
  "REGISTRATION",
  "APPOINTMENTS",
  "CLINICAL",
  "DOCUMENTS",
  "FINANCIAL",
] as const;
export type TimelineGroup = (typeof TIMELINE_GROUPS)[number];

export const TIMELINE_KINDS = [
  "PATIENT_REGISTERED",
  "CONSENT_RECORDED",
  "APPOINTMENT",
  "CLINICAL_NOTE_FINALIZED",
  "CLINICAL_ADDENDUM_ADDED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_GENERATED",
  "CHARGE_CREATED",
  "PAYMENT_RECEIVED",
  "PAYMENT_REFUNDED",
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

const GROUP_OF: Record<TimelineKind, TimelineGroup> = {
  PATIENT_REGISTERED: "REGISTRATION",
  CONSENT_RECORDED: "REGISTRATION",
  APPOINTMENT: "APPOINTMENTS",
  CLINICAL_NOTE_FINALIZED: "CLINICAL",
  CLINICAL_ADDENDUM_ADDED: "CLINICAL",
  DOCUMENT_UPLOADED: "DOCUMENTS",
  DOCUMENT_GENERATED: "DOCUMENTS",
  CHARGE_CREATED: "FINANCIAL",
  PAYMENT_RECEIVED: "FINANCIAL",
  PAYMENT_REFUNDED: "FINANCIAL",
};

export function groupOf(kind: TimelineKind): TimelineGroup {
  return GROUP_OF[kind];
}

export function kindsOf(groups: readonly TimelineGroup[]): TimelineKind[] {
  return TIMELINE_KINDS.filter((kind) => groups.includes(GROUP_OF[kind]));
}

export function isTimelineGroup(value: string): value is TimelineGroup {
  return (TIMELINE_GROUPS as readonly string[]).includes(value);
}
