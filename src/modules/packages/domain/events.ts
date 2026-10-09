// Domain events of the packages module (architecture 5.4). They are published inside the
// transaction; payloads hold IDs and counts, never personal data.
export type PackageEvent = { type: string; occurredAt: Date; payload: Record<string, unknown> };

export const PACKAGES_EVENTS = {
  sold: "PackageSold",
  sessionDebited: "PackageSessionDebited",
  sessionRestored: "PackageSessionRestored",
  expired: "PackageExpired",
  extended: "PackageExtended",
  cancelled: "PackageCancelled",
} as const;

export type PackageEventPayload = {
  packageId: string;
  patientId: string;
  chargeId: string | null;
  appointmentId: string | null;
  usedSessions: number;
  totalSessions: number;
  actorUserId: string | null;
};

export function packageEvent(type: string, payload: PackageEventPayload, now: Date): PackageEvent {
  return { type, occurredAt: now, payload: { ...payload } };
}
