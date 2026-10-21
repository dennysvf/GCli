import { describe, expect, it } from "vitest";
import { isCoveredBySubject, maskAnonymizedChanges, subjectPatientId } from "./mask-anonymized";
import { presentChanges, type ValueDisplay } from "./present-changes";

const display: ValueDisplay = {
  label: (field) => field,
  yes: "Sim",
  no: "Não",
  empty: "—",
  hidden: "valor oculto",
  anonymized: "dado anonimizado",
  instant: (iso) => iso,
  sensitive: (before, after) => `${before}/${after}`,
};

const ANON = "0192a1c4-7b3e-7c11-9f00-3a1b2c3d4e5f";
const OTHER = "0192a1c4-7b3e-7c11-9f00-000000000001";

const update = {
  fullName: { before: "Joana Prado", after: "Joana Prado Lima" },
  mobilePhone: { before: "+5511955550000", after: "+5511944440000" },
  sex: { before: "NOT_INFORMED", after: "FEMALE" },
  birthDate: { before: "1990-01-01", after: "1990-01-02" },
};

describe("anonymized patients", () => {
  it("F15: personal fields of an anonymized patient are masked in both the before and the after value", () => {
    const changes = presentChanges(update, { subjectAnonymized: true }, display);
    const name = changes.find((change) => change.field === "fullName");
    const phone = changes.find((change) => change.field === "mobilePhone");
    expect(name).toMatchObject({ kind: "anonymized", before: null, after: null });
    expect(phone).toMatchObject({ kind: "anonymized", before: null, after: null });
    // Masked even when one side was null (a creation).
    const [created] = presentChanges(
      { email: { before: null, after: "joana@exemplo.com" } },
      { subjectAnonymized: true },
      display,
    );
    expect(created).toMatchObject({ kind: "anonymized", before: null, after: null });
    expect(JSON.stringify(changes)).not.toMatch(/Joana|5511955550000|5511944440000/);
  });

  it("F15: non-personal fields of an anonymized patient stay visible", () => {
    const changes = presentChanges(
      { ...update, anonymized: { before: false, after: true }, active: { before: true, after: false } },
      { subjectAnonymized: true },
      display,
    );
    const shown = Object.fromEntries(
      changes
        .filter((change) => change.kind === "value")
        .map((change) => [change.field, [change.before, change.after]]),
    );
    expect(shown).toEqual({
      active: ["Sim", "Não"],
      anonymized: ["Não", "Sim"],
      birthDate: ["1990-01-01", "1990-01-02"],
      sex: ["NOT_INFORMED", "FEMALE"],
    });
  });

  it("F15: events of a patient that is not anonymized are never masked", () => {
    const changes = presentChanges(update, { subjectAnonymized: false }, display);
    expect(changes.every((change) => change.kind === "value")).toBe(true);
    expect(
      isCoveredBySubject({ entityType: "patient", entityId: OTHER, metadata: null }, new Set([ANON])),
    ).toBe(false);
  });

  it("F15: an event that only references an anonymized patient in its metadata masks personal keys and nothing else", () => {
    const lgpd = { entityType: "lgpd_request", entityId: OTHER, metadata: { patientId: ANON } };
    expect(subjectPatientId(lgpd)).toBe(ANON);
    expect(isCoveredBySubject(lgpd, new Set([ANON]))).toBe(true);
    expect(
      subjectPatientId({ entityType: "lgpd_request", entityId: OTHER, metadata: { patientId: "nope" } }),
    ).toBeNull();
    expect(subjectPatientId({ entityType: "patient", entityId: ANON, metadata: null })).toBe(ANON);

    const masked = maskAnonymizedChanges([
      { field: "status", kind: "value" },
      { field: "fullName", kind: "value" },
      { field: "approvalPinHash", kind: "hidden" },
    ]);
    expect(masked).toEqual([
      { field: "status", kind: "value" },
      { field: "fullName", kind: "anonymized" },
      { field: "approvalPinHash", kind: "hidden" },
    ]);
  });
});
