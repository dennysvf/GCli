import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TIMELINE_GROUPS } from "@/modules/privacy";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  idOf,
  privacy,
  privacyWorld,
  seedRichHistory,
  timelinePage,
  wholeTimeline,
  type PrivacyWorld,
  type RichHistory,
} from "./support";

let world: PrivacyWorld;
let history: RichHistory;

beforeAll(async () => {
  await resetDatabase();
  world = await privacyWorld();
  history = await seedRichHistory(world);
});
afterAll(closeHelpers);

const CLINICAL_KINDS = ["CLINICAL_NOTE_FINALIZED", "CLINICAL_ADDENDUM_ADDED"];
const FINANCIAL_KINDS = ["CHARGE_CREATED", "PAYMENT_RECEIVED", "PAYMENT_REFUNDED"];

describe("timeline role filtering", () => {
  it("F14: front desk receives no clinical event in any page", async () => {
    const items = await wholeTimeline(world.desk, { patientId: history.patientId });
    expect(items.some((item) => CLINICAL_KINDS.includes(item.kind))).toBe(false);
    const ids = items.map(idOf);
    expect(ids).not.toContain(history.documents.clinical);
    expect(ids).toContain(history.documents.personal);
    expect(ids).toContain(history.documents.generated);
    expect(items.some((item) => FINANCIAL_KINDS.includes(item.kind))).toBe(true);
    const serialized = JSON.stringify(items);
    expect(serialized).not.toContain(history.notes.ana);
    expect(serialized).not.toContain(history.addendumId);
    expect(serialized).not.toContain("Exame de sangue");
    const page = await timelinePage(world.desk, { patientId: history.patientId });
    expect(page.visibleGroups).not.toContain("CLINICAL");
  });

  it("F14: front desk asking for the clinical group receives no clinical event", async () => {
    const page = await timelinePage(world.desk, { patientId: history.patientId, groups: ["CLINICAL"] });
    expect(page.items).toEqual([]);
    for (const group of TIMELINE_GROUPS) {
      const items = await wholeTimeline(world.desk, { patientId: history.patientId, groups: [group] });
      expect(items.some((item) => CLINICAL_KINDS.includes(item.kind))).toBe(false);
      expect(items.map(idOf)).not.toContain(history.documents.clinical);
    }
  });

  it("F14: professionals receive no financial event", async () => {
    const items = await wholeTimeline(world.pro, { patientId: history.patientId });
    expect(items.some((item) => FINANCIAL_KINDS.includes(item.kind))).toBe(false);
    expect(JSON.stringify(items)).not.toContain(history.chargeNumber);
    const page = await timelinePage(world.pro, { patientId: history.patientId, groups: ["FINANCIAL"] });
    expect(page.items).toEqual([]);
    expect(page.visibleGroups).not.toContain("FINANCIAL");
    const ids = items.map(idOf);
    expect(ids).toContain(history.notes.ana);
    expect(ids).toContain(history.addendumId);
    expect(ids).toContain(history.consentId);
    expect(ids).toContain(history.appointments.ana);
  });

  it("F14: professionals see only their own appointments", async () => {
    const items = await wholeTimeline(world.pro, { patientId: history.patientId, groups: ["APPOINTMENTS"] });
    const ids = items.map(idOf);
    expect(ids).toContain(history.appointments.ana);
    expect(ids).toContain(history.appointments.future);
    expect(ids).not.toContain(history.appointments.bruno);
  });

  it("F14: professionals see the finalized notes of other professionals", async () => {
    const items = await wholeTimeline(world.pro, { patientId: history.patientId, groups: ["CLINICAL"] });
    const bruno = items.find((item) => idOf(item) === history.notes.bruno);
    expect(bruno).toMatchObject({ kind: "CLINICAL_NOTE_FINALIZED", professionalName: "Dr. Bruno" });
  });

  it("F14: an unlinked manager sees financial events but nothing clinical", async () => {
    const items = await wholeTimeline(world.manager, { patientId: history.patientId });
    expect(items.some((item) => FINANCIAL_KINDS.includes(item.kind))).toBe(true);
    expect(items.some((item) => CLINICAL_KINDS.includes(item.kind))).toBe(false);
    expect(items.map(idOf)).not.toContain(history.documents.clinical);
    expect(items.map(idOf)).toContain(history.appointments.bruno);
  });

  it("F14: a linked administrator with records access sees clinical events", async () => {
    const items = await wholeTimeline(world.linkedAdmin, { patientId: history.patientId });
    const ids = items.map(idOf);
    expect(ids).toContain(history.notes.ana);
    expect(ids).toContain(history.notes.bruno);
    expect(ids).toContain(history.documents.clinical);
    expect(items.some((item) => FINANCIAL_KINDS.includes(item.kind))).toBe(true);
  });

  it("F14: a professional without an appointment with the patient cannot read the timeline", async () => {
    // Dra. Ana has no appointment with João (F05 visibility policy).
    const result = await privacy.getPatientTimeline(world.pro, { patientId: world.patients.joao });
    expect(!result.ok && result.error.code).toBe("AUTHZ_FORBIDDEN");
  });
});
