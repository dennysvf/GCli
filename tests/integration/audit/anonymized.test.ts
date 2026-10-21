import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/shared/db/client";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  auditWorld,
  csvLines,
  detailOrThrow,
  exportOrThrow,
  searchOrThrow,
  seedAnonymized,
  type AuditWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: AuditWorld;
let anon: Awaited<ReturnType<typeof seedAnonymized>>;
beforeEach(async () => {
  world = await auditWorld();
  anon = await seedAnonymized(world);
});

const PERSONAL = /Joana|5511955550000|5511944440000/;

describe("anonymized patients", () => {
  it("F15: the detail of an event of an anonymized patient masks name and phone", async () => {
    const detail = await detailOrThrow(world.admin, anon.events.update);
    expect(detail).toMatchObject({
      action: "UPDATE",
      ipAddress: "203.0.113.10",
      actor: { name: "Ana Admin" },
    });
    expect(detail.changes).toEqual([
      expect.objectContaining({ field: "fullName", kind: "anonymized", before: null, after: null }),
      expect.objectContaining({ field: "mobilePhone", kind: "anonymized", before: null, after: null }),
      expect.objectContaining({ field: "sex", kind: "value", before: "NOT_INFORMED", after: "FEMALE" }),
    ]);
    expect(JSON.stringify(detail)).not.toMatch(PERSONAL);
    // Events recorded before the anonymization are masked too.
    const created = await detailOrThrow(world.admin, anon.events.create);
    expect(created.changes.every((change) => change.kind === "anonymized")).toBe(true);
    expect(JSON.stringify(created)).not.toMatch(PERSONAL);
  });

  it("F15: the anonymization event and non-personal fields stay readable", async () => {
    const detail = await detailOrThrow(world.admin, anon.events.final);
    expect(detail.changes).toEqual([
      expect.objectContaining({ field: "active", kind: "value", before: "Sim", after: "Não" }),
      expect.objectContaining({ field: "anonymized", kind: "value", before: "Não", after: "Sim" }),
    ]);
    expect(detail.metadata).toContainEqual({ key: "anonymizedCode", value: "A1B2C3" });
  });

  it("F15: an LGPD event of an anonymized patient stays readable", async () => {
    const detail = await detailOrThrow(world.admin, anon.events.lgpd);
    expect(detail.changes).toEqual([
      expect.objectContaining({ field: "status", kind: "value", before: "PROCESSING", after: "COMPLETED" }),
    ]);
    expect(detail.changes.some((change) => change.kind === "anonymized")).toBe(false);
  });

  it("F15: the events of an anonymized patient stay searchable with their summaries", async () => {
    const page = await searchOrThrow(world.admin, { entityType: "patient", entityId: anon.patientAnon });
    expect(page.items.map((item) => item.id)).toEqual([
      anon.events.final,
      anon.events.update,
      anon.events.create,
    ]);
    expect(page.items[1]).toMatchObject({
      summary: "Cadastro do paciente alterado",
      hasChanges: true,
      actor: { name: "Ana Admin" },
    });
  });

  it("F15: the CSV of an anonymized patient masks personal fields and the stored rows are unchanged", async () => {
    const exported = await exportOrThrow(world.admin, { entityType: "patient", entityId: anon.patientAnon });
    expect(exported.rowCount).toBe(3);
    const rows = csvLines(exported.text).slice(1);
    expect(rows).toHaveLength(3);
    const update = rows.find((line) => line.includes(anon.events.update)) ?? "";
    expect(update).toContain(
      "fullName: dado anonimizado | mobilePhone: dado anonimizado | sex: NOT_INFORMED → FEMALE",
    );
    expect(exported.text).not.toMatch(PERSONAL);

    const stored = await db().auditEvent.findFirstOrThrow({ where: { id: anon.events.update } });
    expect(stored.changes).toMatchObject({
      fullName: { before: "Joana Prado", after: "Joana Prado Lima" },
      mobilePhone: { before: "+5511955550000", after: "+5511944440000" },
    });
  });

  it("F15: the personal data of a patient that is not anonymized is still shown", async () => {
    const detail = await detailOrThrow(world.admin, world.events.patientUpdate);
    expect(detail.changes.map((change) => change.kind)).toEqual(["value", "value"]);
    const exported = await exportOrThrow(world.admin, { entityType: "patient", entityId: world.patientP1 });
    expect(exported.text).toContain("fullName: Maria Souza → Maria Souza Lima");
  });

  it("F15: the CSV writes the masked text in the user's language", async () => {
    const exported = await exportOrThrow(world.adminEn, {
      entityType: "patient",
      entityId: anon.patientAnon,
    });
    expect(exported.text).toContain("fullName: anonymized data | mobilePhone: anonymized data");
    const spanish = await exportOrThrow(
      { ...world.admin, locale: "es" },
      { entityType: "patient", entityId: anon.patientAnon },
    );
    expect(spanish.text).toContain("fullName: dato anonimizado");
  });
});
