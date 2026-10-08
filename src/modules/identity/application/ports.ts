import type { Locale } from "@/shared/i18n/locales";
import type { CountryCode } from "@/shared/kernel/countries/codes";
import type { Role } from "@/shared/kernel/roles";

// Ports implemented by identity/infrastructure and wired in identity/index.ts.

export type RequestMeta = {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
  headers: Headers;
};

export type UserStatus = "ACTIVE" | "INACTIVE";

export type IdentityUser = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  // Null means "use the organization default language".
  locale: Locale | null;
  organizationLocale: Locale;
  organizationCountry: CountryCode;
  lockedUntil: Date | null;
  failedLoginCount: number;
};

export type AuthSession = {
  id: string;
  userId: string;
  createdAt: Date;
  lastActiveAt: Date;
};

// Better Auth, used only through its server API (ADR-014).
export interface AuthGateway {
  signIn(
    email: string,
    password: string,
    meta: RequestMeta,
  ): Promise<{ ok: true; setCookies: string[] } | { ok: false }>;
  signOut(headers: Headers): Promise<string[]>;
  getSession(headers: Headers): Promise<AuthSession | null>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
  // Whether `password` is the user's current password; false when the user has none (PRD F09).
  verifyPassword(userId: string, password: string): Promise<boolean>;
  // Whether a secret (a password or an approval PIN) matches an argon2 hash.
  verifyHash(storedHash: string, secret: string): Promise<boolean>;
  // Verifies against a fixed hash so unknown or inactive accounts take as long as real ones.
  equalizeTiming(password: string): Promise<void>;
}

// Lookups that happen before the organization is known (sign-in, reset, invitation links).
export interface IdentityDirectory {
  findUserByEmail(email: string): Promise<IdentityUser | null>;
  findUserById(id: string): Promise<IdentityUser | null>;
  findResetTokenUserId(token: string): Promise<string | null>;
  findInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  findOrganizationName(organizationId: string): Promise<string | null>;
  touchSession(sessionId: string, now: Date): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

export type InvitationRecord = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: Role;
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  expiresAt: Date;
  acceptedUserId: string | null;
};

export interface RateLimiter {
  consume(key: string, rule: { limit: number; windowSeconds: number }, now: Date): Promise<boolean>;
  isBlocked(key: string, now: Date): Promise<boolean>;
  registerFailure(
    key: string,
    options: { maxFailures: number; lockMinutes: number },
    now: Date,
  ): Promise<{ locked: boolean }>;
  clear(key: string): Promise<void>;
}

export interface LogoStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string | undefined } | null>;
  delete(key: string): Promise<void>;
}

// Converts an uploaded logo to a PNG within the maximum size (spec section 3).
export interface LogoProcessor {
  toPng(input: Uint8Array, maxWidth: number, maxHeight: number): Promise<Uint8Array>;
}

// Professional profiles linked to users, provided by professionals (F04) and registered by the
// composition root (dependency inversion, ADR-007: professionals already depends on identity).
// Only active professionals are returned.
export interface ProfessionalLinks {
  findLinkedProfessionalId(organizationId: string, userId: string): Promise<string | null>;
  linkedProfessionals(
    organizationId: string,
    userIds: string[],
  ): Promise<Map<string, { id: string; name: string }>>;
}

export type IdentityDeps = {
  auth: AuthGateway;
  directory: IdentityDirectory;
  rateLimiter: RateLimiter;
  logos: LogoStore;
  logoProcessor: LogoProcessor;
  appUrl: string;
  professionalLinks: () => ProfessionalLinks;
  clock: () => Date;
};
