import { describe, expect, it } from "vitest";
import { SessionPackage } from "./package";

const NOW = new Date("2026-10-09T12:00:00Z");

function sold(totalSessions = 10, validityDays = 180) {
  return SessionPackage.sell({
    id: "p1",
    organizationId: "org",
    patientId: "patient",
    templateId: "tpl",
    name: "Fisioterapia 10 sessões",
    serviceId: "svc",
    totalSessions,
    unitId: "unit",
    currency: "BRL",
    priceMinor: 150_000,
    soldOn: "2026-10-09",
    validityDays,
    chargeId: "charge",
    soldById: "user",
    now: NOW,
  });
}

describe("SessionPackage", () => {
  it("F10: free balance counts used and open links", () => {
    const pkg = sold();
    pkg.setOpenLinks(2);
    pkg.debit({ appointmentId: "a1", actorUserId: "u", now: NOW });
    pkg.debit({ appointmentId: "a2", actorUserId: "u", now: NOW });
    pkg.debit({ appointmentId: "a3", actorUserId: "u", now: NOW });
    // 3 used from 10, no open link left after the debits (the third had none to close).
    expect(pkg.snapshot.usedSessions).toBe(3);
    pkg.setOpenLinks(2);
    expect(pkg.freeSessions).toBe(5);
    expect(pkg.canLink("2026-10-20").ok).toBe(true);

    const tight = sold(2);
    tight.setOpenLinks(2);
    const blocked = tight.canLink("2026-10-20");
    expect(!blocked.ok && blocked.error.code).toBe("PACKAGE_BALANCE_EXHAUSTED");
    expect(!blocked.ok && blocked.error.params).toEqual({ remaining: 2, linked: 2 });
  });

  it("F10: a link after the expiry date is refused", () => {
    const pkg = sold(10, 30);
    expect(pkg.snapshot.expiresOn).toBe("2026-11-07");
    expect(pkg.canLink("2026-11-07").ok).toBe(true);
    const late = pkg.canLink("2026-11-08");
    expect(!late.ok && late.error.code).toBe("PACKAGE_EXPIRES_BEFORE");
    pkg.expire({ now: NOW });
    const expired = pkg.canLink("2026-10-10");
    expect(!expired.ok && expired.error.code).toBe("PACKAGE_EXPIRED");
  });

  it("F10: debit and restore move one session and the open link", () => {
    const pkg = sold();
    pkg.setOpenLinks(1);
    pkg.debit({ appointmentId: "a1", actorUserId: "u", now: NOW });
    expect(pkg.snapshot).toMatchObject({ usedSessions: 1, openLinks: 0 });
    expect(pkg.restore({ appointmentId: "a1", actorUserId: "u", now: NOW })).toBe("LINKED");
    expect(pkg.snapshot).toMatchObject({ usedSessions: 0, openLinks: 1 });
    expect(pkg.movements.map((movement) => movement.kind)).toEqual(["SALE", "DEBIT", "RESTORE"]);
  });

  it("F10: expiring forfeits the remaining sessions", () => {
    const pkg = sold();
    pkg.setOpenLinks(1);
    pkg.debit({ appointmentId: "a1", actorUserId: "u", now: NOW });
    pkg.debit({ appointmentId: "a2", actorUserId: "u", now: NOW });
    pkg.debit({ appointmentId: "a3", actorUserId: "u", now: NOW });
    pkg.debit({ appointmentId: "a4", actorUserId: "u", now: NOW });
    const result = pkg.expire({ now: NOW });
    expect(result.ok && result.value.forfeited).toBe(6);
    expect(pkg.snapshot).toMatchObject({
      status: "EXPIRED",
      forfeitedSessions: 6,
      usedSessions: 4,
      openLinks: 0,
    });
    expect(pkg.restore({ appointmentId: "a4", actorUserId: null, now: NOW })).toBe("RELEASED");
    expect(pkg.snapshot).toMatchObject({ usedSessions: 3, forfeitedSessions: 7 });
    expect(pkg.expire({ now: NOW }).ok).toBe(false);
  });

  it("F10: extensions need a reason, add up to 365 days and move the expiry", () => {
    const pkg = sold(10, 180);
    const noReason = pkg.extend({ days: 30, reason: " ", userId: "m", now: NOW });
    expect(!noReason.ok && noReason.error.code).toBe("PACKAGE_REASON_REQUIRED");
    expect(pkg.extend({ days: 300, reason: "Paciente afastado", userId: "m", now: NOW }).ok).toBe(true);
    const over = pkg.extend({ days: 66, reason: "Mais um pouco", userId: "m", now: NOW });
    expect(!over.ok && over.error.code).toBe("PACKAGE_EXTENSION_LIMIT");
    expect(!over.ok && over.error.params).toEqual({ days: 65 });
    expect(pkg.extend({ days: 65, reason: "Último ajuste", userId: "m", now: NOW }).ok).toBe(true);
    expect(pkg.snapshot.extendedDays).toBe(365);
    pkg.cancel({ reason: "Mudança de cidade", userId: "m", now: NOW });
    const closed = pkg.extend({ days: 1, reason: "Tentativa", userId: "m", now: NOW });
    expect(!closed.ok && closed.error.code).toBe("PACKAGE_NOT_ACTIVE");
  });

  it("F10: cancelling zeroes the balance and needs a reason", () => {
    const pkg = sold();
    pkg.setOpenLinks(3);
    const noReason = pkg.cancel({ reason: "", userId: "m", now: NOW });
    expect(!noReason.ok && noReason.error.code).toBe("PACKAGE_REASON_REQUIRED");
    const result = pkg.cancel({ reason: "Paciente desistiu", userId: "m", now: NOW });
    expect(result.ok && result.value.forfeited).toBe(10);
    expect(pkg.snapshot).toMatchObject({ status: "CANCELLED", forfeitedSessions: 10, openLinks: 0 });
    expect(pkg.freeSessions).toBe(0);
  });
});
