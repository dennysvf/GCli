import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ensureAuditPartitions } from "@/modules/audit";
import { getOrganizationProfile, identity } from "@/modules/identity";
import { db } from "@/shared/db/client";
import { forTenant } from "@/shared/db/tenant";
import { ROLES } from "@/shared/kernel/roles";
import {
  auditEvents,
  closeHelpers,
  createOrganization,
  createUser,
  resetDatabase,
  signedInContext,
} from "../helpers";

beforeEach(resetDatabase);
afterAll(closeHelpers);

describe("tenant isolation", () => {
  it("F01: queries never return records from another organization", async () => {
    const orgA = await createOrganization("Clínica A");
    const orgB = await createOrganization("Clínica B");
    const adminA = await createUser({ organizationId: orgA, role: "ADMINISTRATOR", name: "Admin A" });
    await createUser({ organizationId: orgB, role: "ADMINISTRATOR", name: "Admin B" });
    const { ctx } = await signedInContext(adminA);

    const users = await identity.listUsers(ctx, {});
    expect(users.ok && users.value.items.map((item) => item.name)).toEqual(["Admin A"]);
    const profile = await getOrganizationProfile(ctx);
    expect(profile.ok && profile.value.tradeName).toBe("Clínica A");

    // Scoped writes: create injects the tenant, updates cannot reach the other tenant.
    const scoped = forTenant(orgA);
    const other = await db().user.findFirstOrThrow({ where: { organizationId: orgB } });
    const touched = await scoped.user.updateMany({ where: { id: other.id }, data: { name: "Hacked" } });
    expect(touched.count).toBe(0);
    expect((await db().user.findUniqueOrThrow({ where: { id: other.id } })).name).toBe("Admin B");
  });
});

describe("audit log", () => {
  it("F01: runtime role cannot update or delete audit records", async () => {
    const org = await createOrganization();
    const admin = await createUser({ organizationId: org, role: "ADMINISTRATOR" });
    await signedInContext(admin);
    expect((await auditEvents({ action: "LOGIN" })).length).toBe(1);

    const runtime = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      await expect(runtime.query("UPDATE audit_event SET summary = 'x'")).rejects.toThrow(
        /permission denied/,
      );
      await expect(runtime.query("DELETE FROM audit_event")).rejects.toThrow(/permission denied/);
      await expect(runtime.query("TRUNCATE audit_event")).rejects.toThrow(/permission denied/);
    } finally {
      await runtime.end();
    }
  });

  it("F01: create, update, login, failure and denial produce audit records with actor, IP and request ID", async () => {
    const org = await createOrganization();
    const admin = await createUser({ organizationId: org, role: "ADMINISTRATOR" });
    const desk = await createUser({ organizationId: org, role: "FRONT_DESK" });
    await identity.signIn(
      { email: admin.email, password: "errada12345" },
      (await import("../helpers")).meta(),
    );
    const { ctx } = await signedInContext(admin);
    await identity.inviteUser(ctx, {
      name: "Novo Usuário",
      email: "novo@exemplo.com.br",
      role: "FRONT_DESK",
    });
    await identity.changeUserRole(ctx, { userId: desk.id, role: "MANAGER" });
    await identity.listUsers((await signedInContext(desk)).ctx, {}).catch(() => undefined);
    const deskAfter = await createUser({ organizationId: org, role: "FRONT_DESK" });
    await identity.inviteUser((await signedInContext(deskAfter)).ctx, {
      name: "Outro",
      email: "o@exemplo.com.br",
      role: "FRONT_DESK",
    });

    const events = await auditEvents();
    const actions = new Set(events.map((event) => event.action));
    for (const action of ["LOGIN_FAILED", "LOGIN", "CREATE", "UPDATE", "PERMISSION_DENIED"]) {
      expect(actions.has(action), action).toBe(true);
    }
    for (const event of events) {
      expect(event.ipAddress).toBeTruthy();
      expect(event.requestId).toBeTruthy();
      expect(event.occurredAt).toBeInstanceOf(Date);
    }
  });

  it("F01→F15: audit rows carry before and after values for updates", async () => {
    const org = await createOrganization();
    const admin = await createUser({ organizationId: org, role: "ADMINISTRATOR" });
    const { ctx } = await signedInContext(admin);
    await identity.updateOrganization(ctx, {
      legalName: "Nova Razão Social",
      tradeName: "Clínica Exemplo",
      timeZone: "America/Manaus",
      slotGranularityMinutes: 30,
      version: 1,
    });
    const [event] = await auditEvents({ action: "UPDATE", entityId: org });
    expect(event?.changes).toEqual({
      legalName: { before: "Clínica Exemplo Ltda", after: "Nova Razão Social" },
      timeZone: { before: "America/Sao_Paulo", after: "America/Manaus" },
      slotGranularityMinutes: { before: 15, after: 30 },
    });
    expect(event?.actorUserId).toBe(admin.id);
  });

  it("F01: partition job creates the next three months and is idempotent", async () => {
    const future = new Date(Date.UTC(2031, 0, 15));
    const created = await ensureAuditPartitions(process.env.DATABASE_MIGRATION_URL ?? "", future);
    expect(created).toEqual([
      "audit_event_2031_01",
      "audit_event_2031_02",
      "audit_event_2031_03",
      "audit_event_2031_04",
    ]);
    expect(await ensureAuditPartitions(process.env.DATABASE_MIGRATION_URL ?? "", future)).toEqual([]);
  });
});

describe("authorization", () => {
  it("F01: every role gets 403 on forbidden F01 actions even when called directly", async () => {
    const org = await createOrganization();
    const target = await createUser({
      organizationId: org,
      role: "FRONT_DESK",
      email: "alvo@exemplo.com.br",
    });
    for (const role of ROLES.filter((value) => value !== "ADMINISTRATOR")) {
      const user = await createUser({ organizationId: org, role });
      const { ctx } = await signedInContext(user);
      const attempts = [
        identity.inviteUser(ctx, { name: "Teste", email: `t-${role}@exemplo.com.br`, role: "FRONT_DESK" }),
        identity.changeUserRole(ctx, { userId: target.id, role: "MANAGER" }),
        identity.deactivateUser(ctx, { userId: target.id }),
        identity.updateOrganization(ctx, {
          legalName: "X Ltda",
          timeZone: "America/Sao_Paulo",
          slotGranularityMinutes: 15,
          version: 1,
        }),
      ];
      for (const result of await Promise.all(attempts)) {
        expect(!result.ok && result.error.code, role).toBe("AUTHZ_FORBIDDEN");
      }
      if (role !== "MANAGER") {
        const list = await identity.listUsers(ctx, {});
        expect(!list.ok && list.error.code, role).toBe("AUTHZ_FORBIDDEN");
      }
    }
    const row = await db().user.findUniqueOrThrow({ where: { id: target.id } });
    expect(row).toMatchObject({ role: "FRONT_DESK", status: "ACTIVE" });
    expect(await db().invitation.count()).toBe(0);
  });
});

describe("setup:admin", () => {
  it("F01: creates the organization and an administrator invitation", async () => {
    const result = await identity.setupFirstAdministrator({
      organizationName: "Clínica Nova",
      adminName: "Ana Lima",
      adminEmail: "ana@clinicanova.com.br",
      cnpj: "11.222.333/0001-81",
    });
    expect(result.ok).toBe(true);
    const invitation = await db().invitation.findFirstOrThrow({});
    expect(invitation).toMatchObject({
      role: "ADMINISTRATOR",
      email: "ana@clinicanova.com.br",
      invitedById: null,
    });
    expect(await db().outboxMessage.count({ where: { type: "email.invitation" } })).toBe(1);
    const events = await auditEvents();
    expect(events.every((event) => event.actorType === "SYSTEM")).toBe(true);
  });

  it("F01: setup:admin refuses to run when an organization exists", async () => {
    await createOrganization();
    const result = await identity.setupFirstAdministrator({
      organizationName: "Outra",
      adminName: "Bia Souza",
      adminEmail: "bia@exemplo.com.br",
    });
    expect(!result.ok && result.error.code).toBe("SETUP_ALREADY_DONE");
    expect(await db().invitation.count()).toBe(0);
  });
});
