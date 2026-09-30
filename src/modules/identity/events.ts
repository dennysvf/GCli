// In-process events published by identity (ADR-007). Payloads carry IDs only.
export const IDENTITY_EVENTS = {
  // payload: { organizationId }
  organizationCreated: "identity.OrganizationCreated",
} as const;
