import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { identity } from "@/modules/identity";
import { db } from "@/shared/db/client";
import { auditEvents, closeHelpers, createOrganization, createUser, meta, resetDatabase } from "../helpers";

let orgId: string;

beforeEach(async () => {
  await resetDatabase();
  orgId = await createOrganization();
});
afterEach(() => vi.useRealTimers());
afterAll(closeHelpers);

describe("sign-in", () => {
  it("F01: valid credentials create a session and redirect by role", async () => {
    const user = await createUser({ organizationId: orgId, role: "ADMINISTRATOR" });
    const result = await identity.signIn({ email: user.email, password: user.password }, meta());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.redirectTo).toBe("/dashboard");
    expect(result.value.setCookies.some((cookie) => cookie.startsWith("gcli.session_token="))).toBe(true);

    const ctx = await identity.resolveRequestContext(meta({ cookies: result.value.setCookies }));
    expect(ctx?.user.id).toBe(user.id);
    expect(ctx?.organizationId).toBe(orgId);
    expect(await auditEvents({ action: "LOGIN", entityId: user.id })).toHaveLength(1);
  });

  it("F01: a safe next path is honored and an external one is ignored", async () => {
    const user = await createUser({ organizationId: orgId, role: "FRONT_DESK" });
    const safe = await identity.signIn({ ...user, next: "/settings/users" }, meta());
    expect(safe.ok && safe.value.redirectTo).toBe("/settings/users");
    const unsafe = await identity.signIn({ ...user, next: "//evil.com" }, meta());
    expect(unsafe.ok && unsafe.value.redirectTo).toBe("/schedule");
  });

  it("F01: wrong credentials show the generic message for existing and unknown emails", async () => {
    const user = await createUser({ organizationId: orgId });
    const wrongPassword = await identity.signIn({ email: user.email, password: "outraSenha123" }, meta());
    const unknownEmail = await identity.signIn(
      { email: "ninguem@exemplo.com.br", password: "outraSenha123" },
      meta(),
    );
    expect(!wrongPassword.ok && wrongPassword.error.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(!unknownEmail.ok && unknownEmail.error.code).toBe("AUTH_INVALID_CREDENTIALS");

    const failures = await auditEvents({ action: "LOGIN_FAILED" });
    expect(failures).toHaveLength(2);
    expect(failures.find((event) => event.organizationId === null)?.actorType).toBe("ANONYMOUS");
  });

  it("F01: five consecutive failures lock the account even with the correct password", async () => {
    const user = await createUser({ organizationId: orgId });
    for (let attempt = 1; attempt <= 5; attempt++) {
      const result = await identity.signIn({ email: user.email, password: "senhaErrada12" }, meta());
      expect(!result.ok && result.error.code).toBe("AUTH_INVALID_CREDENTIALS");
    }
    const sixth = await identity.signIn({ email: user.email, password: user.password }, meta());
    expect(!sixth.ok && sixth.error.code).toBe("AUTH_ACCOUNT_LOCKED");
  });

  it("F01: the lock expires after 15 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = new Date();
    vi.setSystemTime(start);
    const user = await createUser({ organizationId: orgId });
    for (let attempt = 1; attempt <= 5; attempt++) {
      await identity.signIn({ email: user.email, password: "senhaErrada12" }, meta());
    }
    vi.setSystemTime(new Date(start.getTime() + 14 * 60_000));
    const stillLocked = await identity.signIn({ email: user.email, password: user.password }, meta());
    expect(!stillLocked.ok && stillLocked.error.code).toBe("AUTH_ACCOUNT_LOCKED");

    vi.setSystemTime(new Date(start.getTime() + 15 * 60_000 + 1_000));
    const unlocked = await identity.signIn({ email: user.email, password: user.password }, meta());
    expect(unlocked.ok).toBe(true);
    const row = await db().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.failedLoginCount).toBe(0);
    expect(row.lockedUntil).toBeNull();
  });

  it("F01: unknown email shows the lock message after five failures", async () => {
    const email = "desconhecido@exemplo.com.br";
    for (let attempt = 1; attempt <= 5; attempt++) {
      await identity.signIn({ email, password: "qualquer123" }, meta());
    }
    const sixth = await identity.signIn({ email, password: "qualquer123" }, meta());
    expect(!sixth.ok && sixth.error.code).toBe("AUTH_ACCOUNT_LOCKED");
  });

  it("F01: deactivated user cannot sign in", async () => {
    const user = await createUser({ organizationId: orgId, status: "INACTIVE" });
    const result = await identity.signIn({ email: user.email, password: user.password }, meta());
    expect(!result.ok && result.error.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("F01: sign-in is rate limited per IP", async () => {
    const ip = "198.51.100.7";
    for (let attempt = 1; attempt <= 20; attempt++) {
      await identity.signIn({ email: `x${attempt}@exemplo.com.br`, password: "qualquer123" }, meta({ ip }));
    }
    const blocked = await identity.signIn(
      { email: "y@exemplo.com.br", password: "qualquer123" },
      meta({ ip }),
    );
    expect(!blocked.ok && blocked.error.code).toBe("AUTH_RATE_LIMITED");
  });
});

describe("sessions", () => {
  async function signedIn() {
    const user = await createUser({ organizationId: orgId });
    const result = await identity.signIn({ email: user.email, password: user.password }, meta());
    if (!result.ok) throw new Error("sign-in failed");
    return { user, cookies: result.value.setCookies };
  }

  it("F01: session ends after 60 minutes of inactivity", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = new Date();
    vi.setSystemTime(start);
    const { cookies } = await signedIn();
    vi.setSystemTime(new Date(start.getTime() + 59 * 60_000));
    expect(await identity.resolveRequestContext(meta({ cookies }))).not.toBeNull();
    vi.setSystemTime(new Date(start.getTime() + (59 + 60) * 60_000));
    expect(await identity.resolveRequestContext(meta({ cookies }))).toBeNull();
  });

  it("F01: session ends 12 hours after sign-in even when active", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = new Date();
    vi.setSystemTime(start);
    const { cookies } = await signedIn();
    for (let minutes = 30; minutes < 12 * 60; minutes += 30) {
      vi.setSystemTime(new Date(start.getTime() + minutes * 60_000));
      expect(await identity.resolveRequestContext(meta({ cookies }))).not.toBeNull();
    }
    vi.setSystemTime(new Date(start.getTime() + 12 * 60 * 60_000));
    expect(await identity.resolveRequestContext(meta({ cookies }))).toBeNull();
  });

  it("F01: sign-out deletes the session and records LOGOUT", async () => {
    const { user, cookies } = await signedIn();
    const ctx = await identity.resolveRequestContext(meta({ cookies }));
    expect(ctx).not.toBeNull();
    if (!ctx) return;
    await identity.signOut(ctx, meta({ cookies }));
    expect(await identity.resolveRequestContext(meta({ cookies }))).toBeNull();
    expect(await auditEvents({ action: "LOGOUT", entityId: user.id })).toHaveLength(1);
  });
});
