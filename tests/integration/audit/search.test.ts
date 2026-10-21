import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { identity } from "@/modules/identity";
import { db } from "@/shared/db/client";
import { auditEvents, closeHelpers, errorText, resetDatabase } from "../helpers";
import {
  audit,
  auditWorld,
  daysAgo,
  detailOrThrow,
  insertEvent,
  insertPatient,
  searchOrThrow,
  seedEvents,
  today,
  type AuditWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: AuditWorld;
beforeEach(async () => {
  world = await auditWorld();
});

const ids = (page: { items: { id: string }[] }) => page.items.map((item) => item.id);

describe("authorization", () => {
  it("F15: only Administrator can search, open details, list filter options and export", async () => {
    for (const ctx of [world.manager, world.desk, world.pro]) {
      const results = [
        await audit.searchEvents(ctx, {}),
        await audit.getEvent(ctx, world.events.patientUpdate),
        await audit.listFilterOptions(ctx),
        await audit.exportEvents(ctx, {}),
      ];
      for (const result of results) expect(result.ok ? "ok" : result.error.code).toBe("AUTHZ_FORBIDDEN");
    }
    expect((await audit.searchEvents(world.admin, {})).ok).toBe(true);
    expect((await audit.listFilterOptions(world.admin)).ok).toBe(true);
  });

  it("F15: denied audit access is itself audited as permission denied", async () => {
    await audit.searchEvents(world.desk, {});
    await audit.getEvent(world.manager, world.events.patientUpdate);
    await audit.exportEvents(world.pro, {});
    const denials = (await auditEvents({ action: "PERMISSION_DENIED" })).filter(
      (event) => (event.metadata as { permission?: string } | null)?.permission === "audit:read",
    );
    const actors = denials.map((event) => event.actorUserId);
    expect(actors).toContain(world.desk.user.id);
    expect(actors).toContain(world.manager.user.id);
    expect(actors).toContain(world.pro.user.id);
    expect(denials.every((event) => event.organizationId === world.orgA)).toBe(true);
  });
});

describe("filters", () => {
  it("F15: the default period is the last 30 days including today, newest first", async () => {
    const page = await searchOrThrow(world.admin);
    expect(page.period).toEqual({ from: daysAgo(29), to: today() });
    expect(page.pageSize).toBe(100);
    expect(page.exportLimit).toBe(100000);
    expect(page.timeZone).toBe("America/Sao_Paulo");
    const times = page.items.map((item) => item.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(ids(page)).toEqual(
      expect.arrayContaining([
        world.events.patientUpdate,
        world.events.noteUpdate,
        world.events.denied,
        world.events.system,
      ]),
    );
    expect(ids(page)).not.toContain(world.events.old);
    const update = page.items.find((item) => item.id === world.events.patientUpdate);
    expect(update).toMatchObject({
      actor: { type: "USER", userId: world.admin.user.id, name: "Ana Admin", active: true },
      action: "UPDATE",
      entityType: "patient",
      entityId: world.patientP1,
      summary: "Paciente atualizado",
      hasChanges: true,
    });
  });

  it("F15: period filter returns only events inside the local dates", async () => {
    const page = await searchOrThrow(world.admin, { from: daysAgo(400), to: daysAgo(100) });
    expect(ids(page)).toEqual([world.events.old]);
  });

  it("F15: user filter returns events of that user, including an inactive user", async () => {
    const desk = await searchOrThrow(world.admin, { user: world.desk.user.id });
    expect(desk.items.every((item) => item.actor.userId === world.desk.user.id)).toBe(true);
    expect(ids(desk)).toEqual(expect.arrayContaining([world.events.patientCreate, world.events.denied]));
    expect(ids(desk)).not.toContain(world.events.loginFailed);

    const bruno = await searchOrThrow(world.admin, { user: world.bruno.id });
    expect(ids(bruno)).toEqual([world.events.bruno]);
    expect(bruno.items[0]?.actor).toMatchObject({ name: "Bruno Antigo", active: false });
  });

  it("F15: SYSTEM user filter returns system events", async () => {
    const page = await searchOrThrow(world.admin, { user: "SYSTEM" });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((item) => item.actor.type === "SYSTEM")).toBe(true);
    expect(ids(page)).toContain(world.events.system);
  });

  it("F15: action filter returns only that action", async () => {
    const page = await searchOrThrow(world.admin, { action: "PERMISSION_DENIED" });
    expect(page.items.every((item) => item.action === "PERMISSION_DENIED")).toBe(true);
    expect(ids(page)).toContain(world.events.denied);
  });

  it("F15: entity type filter returns only that type", async () => {
    const page = await searchOrThrow(world.admin, { entityType: "clinical_note" });
    expect(page.items.every((item) => item.entityType === "clinical_note")).toBe(true);
    expect(ids(page).sort()).toEqual([world.events.noteUpdate, world.events.noteRead].sort());
  });

  it("F15: entity type and id filter returns only that entity", async () => {
    const page = await searchOrThrow(world.admin, { entityType: "patient", entityId: world.patientP1 });
    expect(ids(page)).toEqual([world.events.patientUpdate, world.events.patientCreate]);
    expect(ids(page)).not.toContain(world.evBUpdate);
  });

  it("F15: entity id without a type is rejected", async () => {
    const result = await audit.searchEvents(world.admin, { entityId: world.patientP1 });
    if (result.ok) throw new Error("expected a failure");
    expect(result.error).toMatchObject({ code: "AUDIT_ENTITY_TYPE_REQUIRED", httpStatus: 400 });
    expect(errorText("audit", result.error)).toBe("Escolha o tipo de entidade para filtrar por id.");
  });

  it("F15: combined filters intersect", async () => {
    const page = await searchOrThrow(world.admin, {
      user: world.admin.user.id,
      action: "UPDATE",
      entityType: "patient",
      entityId: world.patientP1,
    });
    expect(ids(page)).toEqual([world.events.patientUpdate]);
  });

  it("F15: a period longer than 366 days is rejected with the PRD message", async () => {
    const result = await audit.searchEvents(world.admin, { from: daysAgo(400), to: today() });
    if (result.ok) throw new Error("expected a failure");
    expect(result.error).toMatchObject({ code: "AUDIT_PERIOD_TOO_LONG", httpStatus: 400 });
    expect(errorText("audit", result.error)).toBe("O período deve ter no máximo 366 dias.");
  });

  it("F15: unknown filter values are validation errors", async () => {
    for (const input of [
      { action: "RETIME" },
      { entityType: "Patient!" },
      { user: "not-a-user" },
      { cursor: "abc" },
      { from: "2026-02-30" },
    ]) {
      const result = await audit.searchEvents(world.admin, input);
      expect(result.ok ? "ok" : result.error.code, JSON.stringify(input)).toBe("VALIDATION_FAILED");
    }
    // A user of another organization is not a user of this one.
    const other = await audit.searchEvents(world.admin, { user: world.adminB.user.id });
    expect(other.ok ? "ok" : other.error.code).toBe("VALIDATION_FAILED");
  });

  it("F15: the filter options list active and inactive users, the actions and the entity types", async () => {
    const options = await audit.listFilterOptions(world.admin);
    if (!options.ok) throw new Error(options.error.code);
    const names = options.value.users.map((user) => user.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(options.value.users).toContainEqual({ id: world.bruno.id, name: "Bruno Antigo", active: false });
    expect(options.value.users.map((user) => user.id)).not.toContain(world.adminB.user.id);
    expect(options.value.actions).toHaveLength(11);
    expect(options.value.entityTypeGroups.map((group) => group.key)).toContain("privacy");
    expect(options.value.today).toBe(today());
  });
});

describe("pagination", () => {
  it("F15: pages hold 100 events newest first and the cursor returns every event exactly once", async () => {
    // 250 LOGOUT events at distinct instants on the day five days ago (audit-page-set).
    const start = new Date(`${daysAgo(5)}T03:00:00Z`);
    await seedEvents({
      organizationId: world.orgA,
      count: 250,
      from: start,
      to: new Date(start.getTime() + 20 * 60 * 60 * 1000),
      action: "LOGOUT",
      actorUserId: world.admin.user.id,
    });
    const pages = [];
    let cursor: string | null = null;
    do {
      const page = await searchOrThrow(world.admin, { action: "LOGOUT", ...(cursor ? { cursor } : {}) });
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor);
    expect(pages.map((page) => page.items.length)).toEqual([100, 100, 50]);
    expect(pages.at(-1)?.nextCursor).toBeNull();
    for (const page of pages) expect(page.matched).toEqual({ count: 250, capped: false });
    const all = pages.flatMap((page) => page.items);
    expect(new Set(all.map((item) => item.id)).size).toBe(250);
    const times = all.map((item) => item.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("F15: events recorded in the same instant are paged without repeats or gaps", async () => {
    const instant = new Date(Date.now() - 60 * 60 * 1000);
    await db().$executeRaw`
      INSERT INTO audit_event (id, occurred_at, organization_id, actor_type, action)
      SELECT gen_random_uuid(), ${instant}::timestamptz, ${world.orgA}::uuid, 'SYSTEM', 'LOGOUT'
      FROM generate_series(1, 150)`;
    const first = await searchOrThrow(world.admin, { action: "LOGOUT" });
    const second = await searchOrThrow(world.admin, { action: "LOGOUT", cursor: first.nextCursor });
    const all = [...first.items, ...second.items].map((item) => item.id);
    expect(all).toHaveLength(150);
    expect(new Set(all).size).toBe(150);
  });

  it("F15: the capped count reports more than 100,000", async () => {
    await seedEvents({
      organizationId: world.orgA,
      count: 100_001,
      from: new Date(`${daysAgo(3)}T03:00:00Z`),
      to: new Date(`${daysAgo(2)}T02:00:00Z`),
      action: "LOGIN",
      actorUserId: world.admin.user.id,
    });
    const page = await searchOrThrow(world.admin, { action: "LOGIN", from: daysAgo(3), to: daysAgo(3) });
    expect(page.matched).toEqual({ count: 100_001, capped: true });
    expect(page.items).toHaveLength(100);
  }, 180_000);
});

describe("tenancy", () => {
  it("F15: events of another organization and events without an organization never appear", async () => {
    const page = await searchOrThrow(world.admin, { entityType: "patient" });
    expect(ids(page)).not.toContain(world.evBUpdate);
    const all = await searchOrThrow(world.admin, {});
    expect(ids(all)).not.toContain(world.orphan);
    expect(ids(all)).not.toContain(world.evBUpdate);
    const stored = await db().auditEvent.findMany({ where: { id: { in: ids(all) } } });
    expect(stored.every((event) => event.organizationId === world.orgA)).toBe(true);
  });

  it("F15: an anonymized patient of another organization does not mask events of this one", async () => {
    const foreign = await insertPatient(world.orgB, {
      fullName: "Paciente anonimizado #B1B2B3",
      mobilePhone: "",
      anonymizedCode: "B1B2B3",
    });
    // An org-A event that names the same id: the patient join is bound to the event's organization.
    const event = await insertEvent({
      organizationId: world.orgA,
      occurredAt: new Date(Date.now() - 30 * 60 * 1000),
      actorUserId: world.admin.user.id,
      action: "UPDATE",
      entityType: "patient",
      entityId: foreign,
      changes: { fullName: { before: "Lia", after: "Lia Reis" } },
    });
    const detail = await detailOrThrow(world.admin, event);
    expect(detail.changes).toEqual([
      expect.objectContaining({ field: "fullName", kind: "value", before: "Lia", after: "Lia Reis" }),
    ]);
  });
});

describe("F01 events in the viewer", () => {
  it("F15: events recorded by F01 use cases are searchable with their before and after values", async () => {
    const settings = await identity.updateOrganization(world.admin, {
      legalName: "Clínica Auditoria Ltda",
      tradeName: "Clínica Auditoria Centro",
      country: "BR",
      defaultLocale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      slotGranularityMinutes: 15,
      version: 1,
    });
    if (!settings.ok) throw new Error(`updateOrganization failed: ${settings.error.code}`);
    const page = await searchOrThrow(world.admin, { entityType: "organization", action: "UPDATE" });
    const newest = page.items[0];
    expect(newest).toMatchObject({ actor: { name: "Ana Admin" }, hasChanges: true, entityId: world.orgA });
    const detail = await detailOrThrow(world.admin, newest?.id ?? "");
    expect(detail.changes).toContainEqual(
      expect.objectContaining({
        field: "tradeName",
        kind: "value",
        before: "Clínica Auditoria",
        after: "Clínica Auditoria Centro",
      }),
    );

    const role = await identity.changeUserRole(world.admin, { userId: world.desk.user.id, role: "MANAGER" });
    if (!role.ok) throw new Error(`changeUserRole failed: ${role.error.code}`);
    const users = await searchOrThrow(world.admin, {
      entityType: "user",
      entityId: world.desk.user.id,
      action: "UPDATE",
    });
    const roleDetail = await detailOrThrow(world.admin, users.items[0]?.id ?? "");
    expect(roleDetail.changes).toContainEqual(
      expect.objectContaining({ field: "role", before: "FRONT_DESK", after: "MANAGER" }),
    );
  });
});
