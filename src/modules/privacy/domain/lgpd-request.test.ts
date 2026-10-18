import { describe, expect, it } from "vitest";
import { isOverdue, LgpdRequest, type RequestType } from "./lgpd-request";

const NOW = new Date("2026-10-18T13:00:00.000Z");

function request(type: RequestType) {
  return LgpdRequest.register({
    id: "01927a52-0000-7000-8000-000000000001",
    organizationId: "01927a52-0000-7000-8000-000000000002",
    patientId: "01927a52-0000-7000-8000-000000000003",
    type,
    requestedBy: "PATIENT",
    description: "  Paciente pediu cópia dos dados.  ",
    createdById: "01927a52-0000-7000-8000-000000000004",
    now: NOW,
  });
}

describe("LGPD request", () => {
  it("F14: request status transitions follow the lifecycle", () => {
    const access = request("ACCESS");
    expect(access.snapshot.status).toBe("PENDING");
    expect(access.snapshot.description).toBe("Paciente pediu cópia dos dados.");
    expect(access.startExport().ok).toBe(true);
    expect(access.snapshot.status).toBe("PROCESSING");
    // A double click while building is refused.
    const again = access.startExport();
    expect(again.ok ? null : again.error.code).toBe("PRIVACY_EXPORT_IN_PROGRESS");
    access.exportFailed();
    expect(access.snapshot.status).toBe("FAILED");
    expect(access.isOpen()).toBe(true);
    // "Tentar novamente" goes back to PROCESSING, then a success completes the request.
    expect(access.startExport().ok).toBe(true);
    access.exportSucceeded(NOW);
    expect(access.snapshot).toMatchObject({ status: "COMPLETED", completedAt: NOW, completedById: null });
    // "Gerar novamente" keeps the request completed with its first completion date.
    expect(access.startExport().ok).toBe(true);
    access.exportSucceeded(new Date(NOW.getTime() + 60_000));
    expect(access.snapshot).toMatchObject({ status: "COMPLETED", completedAt: NOW });

    const correction = request("CORRECTION");
    const wrongAction = correction.startExport();
    expect(wrongAction.ok ? null : wrongAction.error.code).toBe("PRIVACY_REQUEST_TYPE_MISMATCH");
    expect(correction.complete({ resolution: "Telefone corrigido.", userId: "u", now: NOW }).ok).toBe(true);
    expect(correction.snapshot).toMatchObject({ status: "COMPLETED", resolution: "Telefone corrigido." });
    const twice = correction.complete({ resolution: "Outra resolução.", userId: "u", now: NOW });
    expect(twice.ok ? null : twice.error.code).toBe("PRIVACY_REQUEST_CLOSED");

    const retention = request("ANONYMIZATION");
    expect(retention.registerRetention("u", NOW).ok).toBe(true);
    expect(retention.snapshot).toMatchObject({ status: "LEGAL_RETENTION", completedAt: NOW });
    const closed = retention.completeAnonymization("u", NOW);
    expect(closed.ok ? null : closed.error.code).toBe("PRIVACY_REQUEST_CLOSED");

    const anonymization = request("ANONYMIZATION");
    expect(anonymization.completeAnonymization("u", NOW).ok).toBe(true);
    expect(anonymization.snapshot.status).toBe("COMPLETED");
    const notCorrection = request("ACCESS").registerRetention("u", NOW);
    expect(notCorrection.ok ? null : notCorrection.error.code).toBe("PRIVACY_REQUEST_TYPE_MISMATCH");
  });

  it("F14: a request is overdue only after more than 15 days open", () => {
    expect(isOverdue("PENDING", "2026-10-03", "2026-10-18")).toBe(false);
    expect(isOverdue("PENDING", "2026-10-02", "2026-10-18")).toBe(true);
    expect(isOverdue("FAILED", "2026-09-01", "2026-10-18")).toBe(true);
    expect(isOverdue("COMPLETED", "2026-09-01", "2026-10-18")).toBe(false);
    expect(isOverdue("LEGAL_RETENTION", "2026-09-01", "2026-10-18")).toBe(false);
  });
});
