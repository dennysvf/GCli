import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeHelpers, errorText, resetDatabase } from "../helpers";
import { audit, auditWorld, detailOrThrow, type AuditWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: AuditWorld;
beforeEach(async () => {
  world = await auditWorld();
});

describe("event detail", () => {
  it("F15: update events show field-level before and after values", async () => {
    const detail = await detailOrThrow(world.admin, world.events.patientUpdate);
    expect(detail).toMatchObject({
      action: "UPDATE",
      ipAddress: "203.0.113.10",
      actor: { name: "Ana Admin" },
      entityType: "patient",
      entityId: world.patientP1,
    });
    expect(detail.requestId).toBeTruthy();
    expect(detail.changes).toEqual([
      expect.objectContaining({
        field: "fullName",
        label: "Nome completo",
        kind: "value",
        before: "Maria Souza",
        after: "Maria Souza Lima",
      }),
      expect.objectContaining({
        field: "phoneMobile",
        kind: "value",
        before: "+5511988881111",
        after: "+5511977772222",
      }),
    ]);
  });

  it("F15: clinical note changes show only clinical content changed with character counts", async () => {
    const detail = await detailOrThrow(world.admin, world.events.noteUpdate);
    expect(detail.changes).toEqual([
      {
        field: "content",
        label: "Conteúdo",
        kind: "sensitive",
        before: null,
        after: null,
        beforeLength: 120,
        afterLength: 154,
      },
    ]);
  });

  it("F15: metadata of denials and exports is listed", async () => {
    const denied = await detailOrThrow(world.admin, world.events.denied);
    expect(denied.metadata).toEqual(
      expect.arrayContaining([
        { key: "permission", value: "audit:read" },
        { key: "target", value: "/settings/audit" },
      ]),
    );
    const exported = await audit.exportEvents(world.admin, { action: "UPDATE" });
    if (!exported.ok) throw new Error(exported.error.code);
    await exported.value.body.cancel();
    const search = await audit.searchEvents(world.admin, { action: "EXPORT" });
    if (!search.ok) throw new Error(search.error.code);
    const detail = await detailOrThrow(world.admin, search.value.items[0]?.id ?? "");
    expect(detail.metadata).toEqual(
      expect.arrayContaining([
        { key: "format", value: "csv" },
        { key: "filters.action", value: "UPDATE" },
      ]),
    );
  });

  it("F15: an event of another organization is not found", async () => {
    const result = await audit.getEvent(world.admin, world.evBUpdate);
    if (result.ok) throw new Error("expected a failure");
    expect(result.error).toMatchObject({ code: "AUDIT_EVENT_NOT_FOUND", httpStatus: 404 });
    expect(errorText("audit", result.error)).toBe("Evento de auditoria não encontrado.");
    const malformed = await audit.getEvent(world.admin, "not-an-id");
    expect(malformed.ok ? "ok" : malformed.error.code).toBe("AUDIT_EVENT_NOT_FOUND");
  });

  it("F15: secret-like fields are never shown", async () => {
    const detail = await detailOrThrow(world.admin, world.events.secret);
    expect(detail.changes).toEqual([expect.objectContaining({ field: "approvalPinHash", kind: "hidden" })]);
    const body = JSON.stringify(detail);
    expect(body).not.toContain("old-hash");
    expect(body).not.toContain("new-hash");
  });
});
