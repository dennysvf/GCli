import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { identity } from "@/modules/identity";
import { db } from "@/shared/db/client";
import { invitationEmail, passwordResetEmail } from "@/shared/email/templates";
import { toActionResult } from "@/shared/kernel/action-result";
import { fail } from "@/shared/kernel/result";
import { domainError } from "@/shared/kernel/errors";
import {
  auditEvents,
  closeHelpers,
  createOrganization,
  createUser,
  meta,
  resetDatabase,
  signedInContext,
} from "../helpers";

let orgId: string;

beforeEach(async () => {
  await resetDatabase();
  orgId = await createOrganization();
});
afterAll(closeHelpers);

async function adminContext() {
  const admin = await createUser({ organizationId: orgId, role: "ADMINISTRATOR" });
  return { admin, ctx: (await signedInContext(admin)).ctx };
}

const orgSettings = {
  legalName: "Clínica Exemplo Ltda",
  tradeName: "Clínica Exemplo",
  country: "BR",
  timeZone: "America/Sao_Paulo",
  slotGranularityMinutes: 15,
  version: 1,
};

describe("languages", () => {
  it("F16: each user can switch language and every message is translated", async () => {
    const { admin, ctx } = await adminContext();
    expect(ctx.locale).toBe("pt-BR");

    for (const locale of ["en", "es"] as const) {
      expect(await identity.setUserLocale(ctx, { locale })).toEqual({ ok: true, value: { locale } });
      const next = await signedInContext(admin);
      expect(next.ctx.locale).toBe(locale);
    }
    const events = await auditEvents({ action: "UPDATE", entityId: admin.id });
    expect(events.map((event) => event.changes)).toEqual([
      { locale: { before: null, after: "en" } },
      { locale: { before: "en", after: "es" } },
    ]);

    // An unsupported language is refused with a message key.
    const invalid = await identity.setUserLocale(ctx, { locale: "fr" });
    expect(!invalid.ok && invalid.error.fields?.locale).toBe("validation.localeInvalid");

    // The same error comes back translated in the language of the requester.
    const failed = fail(domainError("IDENTITY_USER_LIMIT", 422));
    expect(toActionResult(failed, "pt-BR", "identity")).toMatchObject({
      error: { message: "Limite de 100 usuários atingido." },
    });
    expect(toActionResult(failed, "en", "identity")).toMatchObject({
      error: { message: "The limit of 100 users has been reached." },
    });
    expect(toActionResult(failed, "es", "identity")).toMatchObject({
      error: { message: "Se alcanzó el límite de 100 usuarios." },
    });
  });

  it("F16: new users and invitations use the organization default language", async () => {
    const { ctx } = await adminContext();
    const saved = await identity.updateOrganization(ctx, { ...orgSettings, defaultLocale: "es" });
    expect(saved.ok).toBe(true);

    // Users without a preference follow the organization default.
    const colleague = await createUser({ organizationId: orgId, role: "FRONT_DESK" });
    expect((await signedInContext(colleague)).ctx.locale).toBe("es");

    // The invitation is written in the organization default unless the inviter chooses another.
    const spanish = await identity.inviteUser(ctx, {
      name: "Carlos Souza",
      email: "carlos@exemplo.com.br",
      role: "FRONT_DESK",
    });
    expect(spanish.ok).toBe(true);
    const english = await identity.inviteUser(ctx, {
      name: "Ana Reis",
      email: "ana@exemplo.com.br",
      role: "MANAGER",
      locale: "en",
    });
    expect(english.ok).toBe(true);
    const messages = await db().outboxMessage.findMany({ where: { type: "email.invitation" } });
    const localeOf = (email: string) =>
      messages.map((message) => message.payload as { to: string; locale: string }).find((p) => p.to === email)
        ?.locale;
    expect(localeOf("carlos@exemplo.com.br")).toBe("es");
    expect(localeOf("ana@exemplo.com.br")).toBe("en");
    expect(
      (await db().invitation.findFirstOrThrow({ where: { email: "carlos@exemplo.com.br" } })).locale,
    ).toBe("es");
  });

  it("F16→F01: the password reset email follows the language of the user", async () => {
    const user = await createUser({ organizationId: orgId, role: "FRONT_DESK" });
    await db().user.update({ where: { id: user.id }, data: { locale: "en" } });
    expect((await identity.requestPasswordReset({ email: user.email }, meta())).ok).toBe(true);
    const message = await db().outboxMessage.findFirstOrThrow({ where: { type: "email.password-reset" } });
    const payload = message.payload as { locale: string; timeZone: string };
    expect(payload).toMatchObject({ locale: "en", timeZone: "America/Sao_Paulo" });
  });

  it("F16: emails are rendered in the language of the recipient", () => {
    const base = {
      to: "a@b.com",
      name: "Ana",
      organizationName: "Clínica Exemplo",
      url: "https://x.test/i?t=1",
    };
    const expiresAt = new Date("2026-10-06T15:00:00Z");
    const pt = invitationEmail({ ...base, expiresAt }, { locale: "pt-BR", timeZone: "America/Sao_Paulo" });
    expect(pt.subject).toBe("Convite para acessar o GCli — Clínica Exemplo");
    expect(pt.text).toContain("06/10/2026 12:00");
    const en = invitationEmail({ ...base, expiresAt }, { locale: "en", timeZone: "America/New_York" });
    expect(en.subject).toBe("Invitation to access GCli — Clínica Exemplo");
    expect(en.html).toContain('lang="en"');
    expect(en.text).toContain("10/06/2026 11:00 AM");
    const es = invitationEmail({ ...base, expiresAt }, { locale: "es", timeZone: "Europe/Madrid" });
    expect(es.subject).toBe("Invitación para acceder a GCli — Clínica Exemplo");
    expect(es.text).toContain("06/10/2026 17:00");
    const reset = passwordResetEmail(
      { to: "a@b.com", name: "Ana", url: "https://x.test/r?t=1" },
      { locale: "es", timeZone: "Europe/Madrid" },
    );
    expect(reset.subject).toBe("Restablecimiento de contraseña de GCli");
    expect(reset.html).toContain("Restablecer contraseña");
  });
});
