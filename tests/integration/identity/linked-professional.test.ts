import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { identity } from "@/modules/identity";
import { professionals } from "@/modules/professionals";
import { can } from "@/shared/authz/permissions";
import { db } from "@/shared/db/client";
import { closeHelpers, createUser, resetDatabase } from "../helpers";
import { contextFor, createProfessionalOrThrow, professionalsContext } from "../professionals/support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

describe("linked professional", () => {
  it("F01/F04: a linked user's request context carries the professional ID", async () => {
    const admin = await professionalsContext();
    const manager = await createUser({ organizationId: admin.organizationId, role: "MANAGER" });
    expect((await contextFor(manager)).linkedProfessionalId).toBeNull();

    const professionalId = await createProfessionalOrThrow(admin, { linkedUserId: manager.id });
    const linked = await contextFor(manager);
    expect(linked.linkedProfessionalId).toBe(professionalId);
    expect(can(linked, "clinical:read")).toBe(true);

    // An inactive professional grants nothing.
    await professionals.setProfessionalActive(admin, { professionalId, active: false });
    expect((await contextFor(manager)).linkedProfessionalId).toBeNull();

    // Neither does a link whose user became Front Desk.
    await professionals.setProfessionalActive(admin, { professionalId, active: true });
    await db().user.update({ where: { id: manager.id }, data: { role: "FRONT_DESK" } });
    const frontDesk = await contextFor(manager);
    expect(frontDesk.linkedProfessionalId).toBeNull();
    expect(can(frontDesk, "clinical:read")).toBe(false);
  });

  it("F01/F04: the users list shows the linked professional", async () => {
    const admin = await professionalsContext();
    const user = await createUser({
      organizationId: admin.organizationId,
      role: "PROFESSIONAL",
      name: "Ana Lima",
    });
    const professionalId = await createProfessionalOrThrow(admin, { linkedUserId: user.id });
    const list = await identity.listUsers(admin, {});
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const row = list.value.items.find((item) => item.id === user.id);
    expect(row?.kind === "user" && row.linkedProfessional).toEqual({
      id: professionalId,
      name: "Dra. Ana Lima",
    });
  });
});
