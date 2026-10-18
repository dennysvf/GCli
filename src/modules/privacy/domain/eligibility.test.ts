import { describe, expect, it } from "vitest";
import { anonymizationOutcome, type AnonymizationFacts } from "./eligibility";

const NONE: AnonymizationFacts = {
  clinicalNotes: 0,
  clinicalDocuments: 0,
  clinicalAlert: false,
  futureAppointments: 0,
  openCharges: 0,
};

describe("anonymization eligibility", () => {
  it("F14: any clinical record means legal retention, before other findings", () => {
    expect(anonymizationOutcome({ ...NONE, clinicalNotes: 1 })).toBe("LEGAL_RETENTION");
    expect(anonymizationOutcome({ ...NONE, clinicalDocuments: 1 })).toBe("LEGAL_RETENTION");
    expect(anonymizationOutcome({ ...NONE, clinicalAlert: true })).toBe("LEGAL_RETENTION");
    expect(anonymizationOutcome({ ...NONE, clinicalNotes: 2, futureAppointments: 3, openCharges: 1 })).toBe(
      "LEGAL_RETENTION",
    );
  });

  it("F14: future appointments or open charges block anonymization", () => {
    expect(anonymizationOutcome({ ...NONE, futureAppointments: 1 })).toBe("BLOCKED");
    expect(anonymizationOutcome({ ...NONE, openCharges: 1 })).toBe("BLOCKED");
  });

  it("F14: a patient without clinical records or pending items is eligible", () => {
    expect(anonymizationOutcome(NONE)).toBe("ELIGIBLE");
  });
});
