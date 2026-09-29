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

async function requestToken(email: string): Promise<string> {
  const result = await identity.requestPasswordReset({ email }, meta());
  expect(result.ok).toBe(true);
  const message = await db().outboxMessage.findFirstOrThrow({
    where: { type: "email.password-reset" },
    orderBy: { createdAt: "desc" },
  });
  const url = new URL((message.payload as { url: string }).url);
  expect(url.pathname).toBe("/reset-password");
  const token = url.searchParams.get("token");
  if (!token) throw new Error("missing token");
  return token;
}

describe("password reset", () => {
  it("F01: reset request writes an outbox email and an audit event", async () => {
    const user = await createUser({ organizationId: orgId });
    await requestToken(user.email);
    const message = await db().outboxMessage.findFirstOrThrow({ where: { type: "email.password-reset" } });
    expect(message.organizationId).toBe(orgId);
    expect((message.payload as { to: string }).to).toBe(user.email);
    expect(await auditEvents({ action: "PASSWORD_RESET_REQUESTED", entityId: user.id })).toHaveLength(1);
  });

  it("F01: password reset response is identical for unknown emails", async () => {
    const result = await identity.requestPasswordReset({ email: "ninguem@exemplo.com.br" }, meta());
    expect(result).toEqual({ ok: true, value: { requested: true } });
    expect(await db().outboxMessage.count()).toBe(0);
  });

  it("F01: new password works, old one stops working, and sessions are revoked", async () => {
    const user = await createUser({ organizationId: orgId });
    const signIn = await identity.signIn({ email: user.email, password: user.password }, meta());
    if (!signIn.ok) throw new Error("sign-in failed");
    const token = await requestToken(user.email);

    const reset = await identity.resetPassword(
      { token, password: "novaSenha2026", confirmPassword: "novaSenha2026" },
      meta(),
    );
    expect(reset).toEqual({ ok: true, value: { redirectTo: "/login?reset=success" } });
    expect(await identity.resolveRequestContext(meta({ cookies: signIn.value.setCookies }))).toBeNull();

    const oldPassword = await identity.signIn({ email: user.email, password: user.password }, meta());
    expect(!oldPassword.ok && oldPassword.error.code).toBe("AUTH_INVALID_CREDENTIALS");
    const newPassword = await identity.signIn({ email: user.email, password: "novaSenha2026" }, meta());
    expect(newPassword.ok).toBe(true);
    expect(await auditEvents({ action: "PASSWORD_RESET", entityId: user.id })).toHaveLength(1);
  });

  it("F01: password reset link cannot be reused", async () => {
    const user = await createUser({ organizationId: orgId });
    const token = await requestToken(user.email);
    const input = { token, password: "novaSenha2026", confirmPassword: "novaSenha2026" };
    expect((await identity.resetPassword(input, meta())).ok).toBe(true);
    const again = await identity.resetPassword(input, meta());
    expect(!again.ok && again.error.code).toBe("AUTH_LINK_INVALID");
  });

  it("F01: password reset link expires after 60 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = new Date();
    vi.setSystemTime(start);
    const user = await createUser({ organizationId: orgId });
    const token = await requestToken(user.email);
    vi.setSystemTime(new Date(start.getTime() + 60 * 60_000 + 1_000));
    const result = await identity.resetPassword(
      { token, password: "novaSenha2026", confirmPassword: "novaSenha2026" },
      meta(),
    );
    expect(!result.ok && result.error.code).toBe("AUTH_LINK_INVALID");
  });

  it("F01: weak password is rejected on reset", async () => {
    const user = await createUser({ organizationId: orgId });
    const token = await requestToken(user.email);
    const result = await identity.resetPassword(
      { token, password: "curta1", confirmPassword: "curta1" },
      meta(),
    );
    expect(!result.ok && result.error.code).toBe("VALIDATION_FAILED");
    expect(!result.ok && result.error.fields?.password).toContain("10 caracteres");
  });

  it("F01: a successful reset clears the account lock", async () => {
    const user = await createUser({ organizationId: orgId });
    for (let attempt = 1; attempt <= 5; attempt++) {
      await identity.signIn({ email: user.email, password: "senhaErrada12" }, meta());
    }
    const token = await requestToken(user.email);
    await identity.resetPassword(
      { token, password: "novaSenha2026", confirmPassword: "novaSenha2026" },
      meta(),
    );
    const result = await identity.signIn({ email: user.email, password: "novaSenha2026" }, meta());
    expect(result.ok).toBe(true);
  });
});
