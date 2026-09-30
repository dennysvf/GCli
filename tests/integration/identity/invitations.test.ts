import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { identity } from "@/modules/identity";
import { db } from "@/shared/db/client";
import {
  auditEvents,
  closeHelpers,
  createOrganization,
  createUser,
  invitationTokenFor,
  meta,
  resetDatabase,
  signedInContext,
} from "../helpers";

let orgId: string;

beforeEach(async () => {
  await resetDatabase();
  orgId = await createOrganization();
});
afterEach(() => vi.useRealTimers());
afterAll(closeHelpers);

async function adminContext() {
  const admin = await createUser({ organizationId: orgId, role: "ADMINISTRATOR" });
  return (await signedInContext(admin)).ctx;
}

const accept = (token: string, password = "senhaNova2026") =>
  identity.acceptInvitation({ token, password, confirmPassword: password }, meta());

describe("invitations", () => {
  it("F01: invitation link sets password and signs in", async () => {
    const ctx = await adminContext();
    const invited = await identity.inviteUser(ctx, {
      name: "Carlos Souza",
      email: "carlos@exemplo.com.br",
      role: "FRONT_DESK",
    });
    expect(invited.ok).toBe(true);

    const token = await invitationTokenFor("carlos@exemplo.com.br");
    const preview = await identity.getInvitation(token);
    expect(preview).toMatchObject({
      ok: true,
      value: { name: "Carlos Souza", organizationName: "Clínica Exemplo" },
    });

    const result = await accept(token);
    expect(result.ok && result.value.redirectTo).toBe("/schedule");
    if (!result.ok) return;
    const newCtx = await identity.resolveRequestContext(meta({ cookies: result.value.setCookies }));
    expect(newCtx?.user).toMatchObject({ email: "carlos@exemplo.com.br", role: "FRONT_DESK" });
    expect(newCtx?.organizationId).toBe(orgId);

    const invitation = await db().invitation.findFirstOrThrow({ where: { email: "carlos@exemplo.com.br" } });
    expect(invitation.status).toBe("ACCEPTED");
    expect(await auditEvents({ action: "CREATE", entityId: newCtx?.user.id })).toHaveLength(1);
  });

  it("F01: invitation link fails after first use", async () => {
    const ctx = await adminContext();
    await identity.inviteUser(ctx, { name: "Ana", email: "ana@exemplo.com.br", role: "MANAGER" });
    const token = await invitationTokenFor("ana@exemplo.com.br");
    expect((await accept(token)).ok).toBe(true);
    const again = await accept(token);
    expect(!again.ok && again.error.code).toBe("AUTH_LINK_INVALID");
  });

  it("F01: invitation link fails after 72 hours", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = new Date();
    vi.setSystemTime(start);
    const ctx = await adminContext();
    await identity.inviteUser(ctx, { name: "Bia", email: "bia@exemplo.com.br", role: "PROFESSIONAL" });
    const token = await invitationTokenFor("bia@exemplo.com.br");
    vi.setSystemTime(new Date(start.getTime() + 72 * 3_600_000 + 1_000));
    expect((await identity.getInvitation(token)).ok).toBe(false);
    const result = await accept(token);
    expect(!result.ok && result.error.code).toBe("AUTH_LINK_INVALID");
  });

  it("F01: resending an invitation invalidates the previous link", async () => {
    const ctx = await adminContext();
    const invited = await identity.inviteUser(ctx, {
      name: "Caio",
      email: "caio@exemplo.com.br",
      role: "FRONT_DESK",
    });
    if (!invited.ok) throw new Error("invite failed");
    const oldToken = await invitationTokenFor("caio@exemplo.com.br");
    expect((await identity.resendInvitation(ctx, { invitationId: invited.value.invitationId })).ok).toBe(
      true,
    );
    const newToken = await invitationTokenFor("caio@exemplo.com.br");
    expect(newToken).not.toBe(oldToken);
    const old = await accept(oldToken);
    expect(!old.ok && old.error.code).toBe("AUTH_LINK_INVALID");
    expect((await accept(newToken)).ok).toBe(true);
  });

  it("F01: revoked invitation cannot be accepted", async () => {
    const ctx = await adminContext();
    const invited = await identity.inviteUser(ctx, {
      name: "Duda",
      email: "duda@exemplo.com.br",
      role: "FRONT_DESK",
    });
    if (!invited.ok) throw new Error("invite failed");
    const token = await invitationTokenFor("duda@exemplo.com.br");
    await identity.revokeInvitation(ctx, { invitationId: invited.value.invitationId });
    const result = await accept(token);
    expect(!result.ok && result.error.code).toBe("AUTH_LINK_INVALID");
  });

  it("F01: weak password is rejected on invitation", async () => {
    const ctx = await adminContext();
    await identity.inviteUser(ctx, { name: "Eva", email: "eva@exemplo.com.br", role: "FRONT_DESK" });
    const token = await invitationTokenFor("eva@exemplo.com.br");
    const result = await identity.acceptInvitation(
      { token, password: "semnumeros", confirmPassword: "semnumeros" },
      meta(),
    );
    expect(!result.ok && result.error.fields?.password).toContain("número");
  });

  it("F01: inviting an existing email or a second pending invitation is rejected", async () => {
    const ctx = await adminContext();
    const existing = await createUser({ organizationId: orgId, email: "existe@exemplo.com.br" });
    const duplicate = await identity.inviteUser(ctx, {
      name: "Xico",
      email: existing.email,
      role: "FRONT_DESK",
    });
    expect(!duplicate.ok && duplicate.error.code).toBe("IDENTITY_EMAIL_IN_USE");
    await identity.inviteUser(ctx, { name: "Yara", email: "y@exemplo.com.br", role: "FRONT_DESK" });
    const pending = await identity.inviteUser(ctx, {
      name: "Yara",
      email: "Y@exemplo.com.br",
      role: "FRONT_DESK",
    });
    expect(!pending.ok && pending.error.code).toBe("IDENTITY_INVITATION_PENDING");
  });

  it("F01: user limit blocks the 101st active user or invitation", async () => {
    const ctx = await adminContext();
    for (let index = 0; index < 99; index++) {
      await createUser({ organizationId: orgId, email: `u${index}@exemplo.com.br` });
    }
    const blocked = await identity.inviteUser(ctx, {
      name: "Zeca",
      email: "z@exemplo.com.br",
      role: "FRONT_DESK",
    });
    expect(!blocked.ok && blocked.error.code).toBe("IDENTITY_USER_LIMIT");
  });

  it("F01: only administrators can invite", async () => {
    const manager = await createUser({ organizationId: orgId, role: "MANAGER" });
    const { ctx } = await signedInContext(manager);
    const result = await identity.inviteUser(ctx, {
      name: "Wagner",
      email: "w@exemplo.com.br",
      role: "FRONT_DESK",
    });
    expect(!result.ok && result.error.code).toBe("AUTHZ_FORBIDDEN");
    expect(await db().invitation.count()).toBe(0);
    expect(await auditEvents({ action: "PERMISSION_DENIED" })).toHaveLength(1);
  });
});
