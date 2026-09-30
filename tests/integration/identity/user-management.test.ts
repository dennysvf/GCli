import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { identity, listLinkableUsers } from "@/modules/identity";
import { db } from "@/shared/db/client";
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

describe("user management", () => {
  it("F01: deactivated user is logged out and cannot sign in again", async () => {
    const admin = await createUser({ organizationId: orgId, role: "ADMINISTRATOR" });
    const target = await createUser({ organizationId: orgId, role: "FRONT_DESK" });
    const { ctx } = await signedInContext(admin);
    const { cookies } = await signedInContext(target);

    const result = await identity.deactivateUser(ctx, { userId: target.id });
    expect(result).toEqual({ ok: true, value: { status: "INACTIVE" } });
    expect(await identity.resolveRequestContext(meta({ cookies }))).toBeNull();
    const again = await identity.signIn({ email: target.email, password: target.password }, meta());
    expect(!again.ok && again.error.code).toBe("AUTH_INVALID_CREDENTIALS");

    const events = await auditEvents({ action: "UPDATE", entityId: target.id });
    expect(events[0]?.changes).toEqual({ status: { before: "ACTIVE", after: "INACTIVE" } });
  });

  it("F01: reactivated user can sign in again", async () => {
    const admin = await createUser({ organizationId: orgId, role: "ADMINISTRATOR" });
    const target = await createUser({ organizationId: orgId, status: "INACTIVE" });
    const { ctx } = await signedInContext(admin);
    expect((await identity.reactivateUser(ctx, { userId: target.id })).ok).toBe(true);
    expect((await identity.signIn({ email: target.email, password: target.password }, meta())).ok).toBe(true);
  });

  it("F01: last active administrator cannot be deactivated or demoted", async () => {
    const admin = await createUser({ organizationId: orgId, role: "ADMINISTRATOR" });
    const other = await createUser({ organizationId: orgId, role: "ADMINISTRATOR", status: "INACTIVE" });
    const { ctx } = await signedInContext(admin);

    const demote = await identity.changeUserRole(ctx, { userId: admin.id, role: "MANAGER" });
    expect(!demote.ok && demote.error.code).toBe("IDENTITY_LAST_ADMIN");
    const self = await identity.deactivateUser(ctx, { userId: admin.id });
    expect(!self.ok && self.error.code).toBe("IDENTITY_SELF_DEACTIVATION");
    expect((await identity.changeUserRole(ctx, { userId: other.id, role: "MANAGER" })).ok).toBe(true);
  });

  it("F01: concurrent demotion of the last two administrators leaves one", async () => {
    const first = await createUser({ organizationId: orgId, role: "ADMINISTRATOR" });
    const second = await createUser({ organizationId: orgId, role: "ADMINISTRATOR" });
    const { ctx: firstCtx } = await signedInContext(first);
    const { ctx: secondCtx } = await signedInContext(second);

    const results = await Promise.all([
      identity.changeUserRole(firstCtx, { userId: second.id, role: "MANAGER" }),
      identity.changeUserRole(secondCtx, { userId: first.id, role: "MANAGER" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await db().user.count({ where: { organizationId: orgId, role: "ADMINISTRATOR" } })).toBe(1);
  });

  it("F01: role change is audited with before and after", async () => {
    const admin = await createUser({ organizationId: orgId, role: "ADMINISTRATOR" });
    const target = await createUser({ organizationId: orgId, role: "FRONT_DESK" });
    const { ctx } = await signedInContext(admin);
    await identity.changeUserRole(ctx, { userId: target.id, role: "MANAGER" });
    const [event] = await auditEvents({ action: "UPDATE", entityId: target.id });
    expect(event?.changes).toEqual({ role: { before: "FRONT_DESK", after: "MANAGER" } });
    expect(event?.actorUserId).toBe(admin.id);
  });

  it("F01: user list includes pending invitations and supports accent-insensitive search", async () => {
    const admin = await createUser({ organizationId: orgId, role: "ADMINISTRATOR", name: "Ana Lima" });
    await createUser({ organizationId: orgId, name: "João Araújo" });
    const { ctx } = await signedInContext(admin);
    await identity.inviteUser(ctx, {
      name: "Carlos Souza",
      email: "carlos@exemplo.com.br",
      role: "FRONT_DESK",
    });

    const all = await identity.listUsers(ctx, {});
    expect(all.ok && all.value.total).toBe(3);
    expect(all.ok && all.value.items.some((item) => item.kind === "invitation")).toBe(true);
    const search = await identity.listUsers(ctx, { search: "joao araujo" });
    expect(search.ok && search.value.items.map((item) => item.name)).toEqual(["João Araújo"]);
  });

  it("F01: managers can list users but front desk cannot", async () => {
    const manager = await createUser({ organizationId: orgId, role: "MANAGER" });
    const desk = await createUser({ organizationId: orgId, role: "FRONT_DESK" });
    expect((await identity.listUsers((await signedInContext(manager)).ctx, {})).ok).toBe(true);
    const denied = await identity.listUsers((await signedInContext(desk)).ctx, {});
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");
  });
});

describe("provided to other features", () => {
  it("F01→F04: listLinkableUsers returns only active users with eligible roles", async () => {
    const admin = await createUser({ organizationId: orgId, role: "ADMINISTRATOR", name: "Ana" });
    await createUser({ organizationId: orgId, role: "PROFESSIONAL", name: "Bruno" });
    await createUser({ organizationId: orgId, role: "MANAGER", name: "Carla" });
    await createUser({ organizationId: orgId, role: "FRONT_DESK", name: "Davi" });
    await createUser({ organizationId: orgId, role: "PROFESSIONAL", name: "Elis", status: "INACTIVE" });
    const { ctx } = await signedInContext(admin);
    const users = await listLinkableUsers(ctx);
    expect(users.map((user) => user.name)).toEqual(["Ana", "Bruno", "Carla"]);
  });
});
