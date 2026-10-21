import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/shared/db/client";
import { closeHelpers, errorText, resetDatabase } from "../helpers";
import {
  audit,
  auditWorld,
  csvLines,
  daysAgo,
  exportOrThrow,
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

const BOM = String.fromCharCode(0xfeff);

async function exportEventsOf(organizationId: string) {
  return db().auditEvent.findMany({
    where: { organizationId, action: "EXPORT", entityType: "audit_log" },
    orderBy: { occurredAt: "desc" },
  });
}

describe("CSV export", () => {
  it("F15: CSV export follows the F13 format in pt-BR and en", async () => {
    const pt = await exportOrThrow(world.admin, { entityType: "clinical_note" });
    expect(pt.contentType).toBe("text/csv; charset=utf-8");
    expect(pt.fileName).toBe(`auditoria-${daysAgo(29)}-${today()}.csv`);
    expect(pt.rowCount).toBe(2);
    expect(pt.text.startsWith(BOM)).toBe(true);
    expect(pt.text.endsWith("\r\n")).toBe(true);
    expect(pt.text.slice(1).replace(/\r\n/g, "")).not.toContain("\n");
    const [header, ...rows] = csvLines(pt.text);
    expect(header).toBe(
      "Data;Hora;Usuário;Ação;Tipo de entidade;Id da entidade;Resumo;Alterações;Endereço IP;Id do evento",
    );
    expect(rows).toHaveLength(2);
    const note = rows.find((line) => line.endsWith(world.events.noteUpdate)) ?? "";
    const cells = note.split(";");
    expect(cells[0]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(cells[1]).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(cells.slice(2, 5)).toEqual(["Dra. Paula", "Atualização", "Nota clínica"]);
    expect(cells[7]).toBe("content: conteúdo clínico alterado (120 → 154 caracteres)");

    const en = await exportOrThrow(world.adminEn, { entityType: "patient", entityId: world.patientP1 });
    expect(en.fileName.startsWith("audit-log-")).toBe(true);
    const [enHeader, ...enRows] = csvLines(en.text);
    expect(enHeader).toBe("Date,Time,User,Action,Entity type,Entity id,Summary,Changes,IP address,Event id");
    const update = enRows.find((line) => line.endsWith(world.events.patientUpdate)) ?? "";
    expect(update.split(",")[0]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(update).toContain("fullName: Maria Souza → Maria Souza Lima");
    expect(update).toContain(",Update,Patient,");
  });

  it("F15: CSV export of 100,000 rows streams every row", async () => {
    await seedEvents({
      organizationId: world.orgA,
      count: 100_000,
      from: new Date(`${daysAgo(1)}T03:00:01Z`),
      to: new Date(`${today()}T02:59:59Z`),
      action: "LOGIN",
      actorUserId: world.admin.user.id,
    });
    const exported = await exportOrThrow(world.admin, { from: daysAgo(1), to: daysAgo(1), action: "LOGIN" });
    expect(exported.rowCount).toBe(100_000);
    const rows = csvLines(exported.text).slice(1);
    expect(rows).toHaveLength(100_000);
    expect(new Set(rows.map((line) => line.split(";").at(-1))).size).toBe(100_000);
  }, 180_000);

  it("F15: CSV export above 100,000 rows is refused before streaming", async () => {
    await seedEvents({
      organizationId: world.orgA,
      count: 100_001,
      from: new Date(`${daysAgo(2)}T03:00:01Z`),
      to: new Date(`${daysAgo(1)}T02:59:59Z`),
      action: "LOGIN",
      actorUserId: world.admin.user.id,
    });
    const result = await audit.exportEvents(world.admin, {
      from: daysAgo(2),
      to: daysAgo(2),
      action: "LOGIN",
    });
    if (result.ok) throw new Error("expected a failure");
    expect(result.error).toMatchObject({ code: "AUDIT_EXPORT_TOO_LARGE", httpStatus: 422 });
    expect(errorText("audit", result.error)).toContain("A exportação em CSV aceita até 100.000 linhas.");
    expect(await exportEventsOf(world.orgA)).toHaveLength(0);
  }, 180_000);

  it("F15: every export is recorded as an EXPORT audit event with filters and row count", async () => {
    const exported = await exportOrThrow(world.admin, { action: "UPDATE" });
    const [event] = await exportEventsOf(world.orgA);
    expect(event).toMatchObject({ actorUserId: world.admin.user.id, entityType: "audit_log" });
    expect(event?.metadata).toEqual({
      format: "csv",
      rows: exported.rowCount,
      filters: { from: daysAgo(29), to: today(), user: "ALL", action: "UPDATE", entityType: "ALL" },
    });
    const page = await searchOrThrow(world.admin, { action: "EXPORT" });
    expect(page.items.map((item) => item.id)).toContain(event?.id);
  });
});
