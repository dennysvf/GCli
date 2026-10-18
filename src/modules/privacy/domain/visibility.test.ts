import { describe, expect, it } from "vitest";
import { groupOf, kindsOf, TIMELINE_KINDS } from "./timeline-event";
import { requestedKinds, visibleGroups, visibleKinds } from "./visibility";

const FRONT_DESK = { clinical: false, financial: true };
const PROFESSIONAL = { clinical: true, financial: false };
const LINKED_ADMIN = { clinical: true, financial: true };

describe("timeline visibility", () => {
  it("F14: front desk visibility excludes clinical kinds", () => {
    const kinds = visibleKinds(FRONT_DESK);
    expect(kinds).not.toContain("CLINICAL_NOTE_FINALIZED");
    expect(kinds).not.toContain("CLINICAL_ADDENDUM_ADDED");
    expect(kinds).toEqual(
      expect.arrayContaining(["APPOINTMENT", "DOCUMENT_UPLOADED", "CHARGE_CREATED", "CONSENT_RECORDED"]),
    );
    expect(visibleGroups(FRONT_DESK)).not.toContain("CLINICAL");
  });

  it("F14: professional visibility excludes financial kinds", () => {
    const kinds = visibleKinds(PROFESSIONAL);
    expect(kinds).not.toContain("CHARGE_CREATED");
    expect(kinds).not.toContain("PAYMENT_RECEIVED");
    expect(kinds).not.toContain("PAYMENT_REFUNDED");
    expect(kinds).toContain("CLINICAL_NOTE_FINALIZED");
    expect(visibleGroups(PROFESSIONAL)).not.toContain("FINANCIAL");
  });

  it("F14: a viewer with both accesses sees every kind", () => {
    expect(visibleKinds(LINKED_ADMIN)).toEqual([...TIMELINE_KINDS]);
  });

  it("F14: requested groups never add a hidden kind", () => {
    expect(requestedKinds(FRONT_DESK, ["CLINICAL"])).toEqual([]);
    expect(requestedKinds(FRONT_DESK, ["CLINICAL", "DOCUMENTS"])).toEqual([
      "DOCUMENT_UPLOADED",
      "DOCUMENT_GENERATED",
    ]);
    expect(requestedKinds(PROFESSIONAL, ["FINANCIAL"])).toEqual([]);
  });

  it("F14: no requested group means every visible group", () => {
    expect(requestedKinds(PROFESSIONAL, [])).toEqual(visibleKinds(PROFESSIONAL));
  });

  it("F14: every kind belongs to exactly one group", () => {
    for (const kind of TIMELINE_KINDS) expect(kindsOf([groupOf(kind)])).toContain(kind);
  });
});
