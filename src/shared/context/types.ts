// Request context shared by every module (spec F01 sections 3 and 5).
import type { Role } from "@/shared/kernel/roles";

export { ROLES, type Role } from "@/shared/kernel/roles";

export type RequestUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

// Context of an authenticated request. Every use case receives it.
export type RequestContext = {
  kind: "user";
  requestId: string;
  organizationId: string;
  user: RequestUser;
  sessionId: string;
  // Filled by F04 when the user is linked to a professional profile.
  linkedProfessionalId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

// Context for work without a signed-in user: worker jobs, CLI commands, and anonymous
// flows such as sign-in (where the organization is not known yet).
export type SystemContext = {
  kind: "system" | "anonymous";
  requestId: string;
  organizationId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type AnyContext = RequestContext | SystemContext;
