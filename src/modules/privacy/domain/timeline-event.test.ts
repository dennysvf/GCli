import { describe, expect, it } from "vitest";
import { groupOf, isTimelineGroup, kindsOf, TIMELINE_GROUPS } from "./timeline-event";

describe("timeline events", () => {
  it("F14: the timeline has the event types of the PRD in five groups", () => {
    expect(TIMELINE_GROUPS).toEqual(["REGISTRATION", "APPOINTMENTS", "CLINICAL", "DOCUMENTS", "FINANCIAL"]);
    expect(kindsOf(["REGISTRATION"])).toEqual(["PATIENT_REGISTERED", "CONSENT_RECORDED"]);
    expect(kindsOf(["CLINICAL"])).toEqual(["CLINICAL_NOTE_FINALIZED", "CLINICAL_ADDENDUM_ADDED"]);
    expect(kindsOf(["FINANCIAL"])).toEqual(["CHARGE_CREATED", "PAYMENT_RECEIVED", "PAYMENT_REFUNDED"]);
    expect(groupOf("DOCUMENT_GENERATED")).toBe("DOCUMENTS");
    expect(isTimelineGroup("APPOINTMENTS")).toBe(true);
    expect(isTimelineGroup("SECRET")).toBe(false);
  });
});
