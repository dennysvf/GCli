import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { isAPIError } from "better-auth/api";
import { getEnv } from "@/shared/config/env";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import {
  SESSION_ABSOLUTE_HOURS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_TTL_MINUTES,
} from "../domain/policies";
import type { AuthGateway, AuthSession, RequestMeta } from "../application/ports";

// Better Auth is used only through auth.api.* from our use cases; its HTTP handler is not
// mounted (ADR-014). Idle expiry is enforced by the request context through lastActiveAt, so
// Better Auth's own session is a fixed 12-hour session without sliding refresh.

// OWASP Argon2id parameters (spec section 3).
// algorithm 2 = Argon2id (@node-rs/argon2 const enum, not importable with isolatedModules).
const ARGON2 = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

function createAuth() {
  const env = getEnv();
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    database: prismaAdapter(db(), { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      // Accounts are created only through invitations (spec section 3).
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      password: {
        hash: hashPassword,
        verify: ({ hash: stored, password }) => verify(stored, password),
      },
      resetPasswordTokenExpiresIn: PASSWORD_RESET_TTL_MINUTES * 60,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, token }) {
        const record = await db().user.findUnique({
          where: { id: user.id },
          select: {
            organizationId: true,
            locale: true,
            organization: { select: { defaultLocale: true, timeZone: true } },
          },
        });
        await db().outboxMessage.create({
          data: {
            id: newId(),
            organizationId: record?.organizationId ?? null,
            type: "email.password-reset",
            payload: {
              to: user.email,
              name: user.name,
              url: `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`,
              // The email follows the user's language, else the organization default (PRD F16).
              locale: record?.locale ?? record?.organization.defaultLocale ?? "pt-BR",
              timeZone: record?.organization.timeZone ?? "America/Sao_Paulo",
            },
          },
        });
      },
    },
    session: {
      expiresIn: SESSION_ABSOLUTE_HOURS * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
      additionalFields: {
        lastActiveAt: { type: "date", required: false, input: false, defaultValue: () => new Date() },
      },
    },
    databaseHooks: {
      session: {
        create: {
          async before(session) {
            return { data: { ...session, userAgent: session.userAgent?.slice(0, 512) ?? null } };
          },
        },
      },
    },
    rateLimit: { enabled: false },
    advanced: {
      cookiePrefix: "gcli",
      useSecureCookies: env.NODE_ENV === "production",
      database: { generateId: () => newId() },
      ipAddress: { disableIpTracking: !env.TRUST_PROXY },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { gcliAuth?: Auth };

export function auth(): Auth {
  globalForAuth.gcliAuth ??= createAuth();
  return globalForAuth.gcliAuth;
}

let dummyHash: Promise<string> | undefined;

export const betterAuthGateway: AuthGateway = {
  async signIn(email: string, password: string, meta: RequestMeta) {
    try {
      const { headers } = await auth().api.signInEmail({
        body: { email, password, rememberMe: true },
        headers: meta.headers,
        returnHeaders: true,
      });
      return { ok: true, setCookies: headers.getSetCookie() };
    } catch (error) {
      if (isAPIError(error)) return { ok: false };
      throw error;
    }
  },

  async signOut(headers: Headers) {
    try {
      const result = await auth().api.signOut({ headers, returnHeaders: true });
      return result.headers.getSetCookie();
    } catch (error) {
      if (isAPIError(error)) return [];
      throw error;
    }
  },

  async getSession(headers: Headers): Promise<AuthSession | null> {
    const result = await auth().api.getSession({ headers });
    if (!result) return null;
    const session = result.session as typeof result.session & { lastActiveAt?: Date | string | null };
    return {
      id: session.id,
      userId: session.userId,
      createdAt: new Date(session.createdAt),
      lastActiveAt: new Date(session.lastActiveAt ?? session.createdAt),
    };
  },

  async requestPasswordReset(email: string) {
    await auth().api.requestPasswordReset({ body: { email } });
  },

  async resetPassword(token: string, newPassword: string) {
    try {
      await auth().api.resetPassword({ body: { token, newPassword } });
      return true;
    } catch (error) {
      if (isAPIError(error)) return false;
      throw error;
    }
  },

  hashPassword,

  async verifyPassword(userId: string, password: string) {
    const account = await db().account.findFirst({
      where: { userId, providerId: "credential" },
      select: { password: true },
    });
    if (!account?.password) return false;
    return verify(account.password, password);
  },

  verifyHash: (storedHash: string, secret: string) => verify(storedHash, secret),

  async equalizeTiming(password: string) {
    dummyHash ??= hashPassword("timing-equalization-password-1");
    await verify(await dummyHash, password);
  },
};
