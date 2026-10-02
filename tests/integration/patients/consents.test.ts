import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { patients } from "@/modules/patients";
import { db } from "@/shared/db/client";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { createPatientOrThrow, patientsContext, publishTerms } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

const PDF = new TextEncoder().encode("%PDF-1.4\n% termo assinado\n");

describe("privacy terms and consent", () => {
  it("F05: consent stores terms version, time, method and user, and a new version makes it pending", async () => {
    const admin = await patientsContext("ADMINISTRATOR", undefined, "Ana Admin");
    const frontDesk = await patientsContext("FRONT_DESK", admin.organizationId, "Rita Recepção");
    const id = await createPatientOrThrow(frontDesk);

    const noTerms = await patients.recordConsent(frontDesk, { patientId: id, method: "VERBAL" });
    expect(!noTerms.ok && noTerms.error.code).toBe("PATIENTS_NO_TERMS");

    expect(await publishTerms(admin)).toBe(1);
    expect((await patients.getPatient(frontDesk, id)).ok).toBe(true);
    const before = await patients.getPatient(frontDesk, id);
    expect(before.ok && before.value.consentStatus).toBe("MISSING");

    const recorded = await patients.recordConsent(frontDesk, { patientId: id, method: "VERBAL" });
    expect(recorded.ok && recorded.value.termsVersion).toBe(1);
    const consents = await patients.listConsents(frontDesk, id);
    expect(consents.ok && consents.value).toEqual([
      expect.objectContaining({
        termsVersion: 1,
        method: "VERBAL",
        recordedByName: "Rita Recepção",
        fileName: null,
      }),
    ]);
    const ok = await patients.getPatient(frontDesk, id);
    expect(ok.ok && ok.value.consentStatus).toBe("OK");

    expect(
      await publishTerms(admin, "Segunda versão dos termos de privacidade da clínica, com novas regras."),
    ).toBe(2);
    const pending = await patients.getPatient(frontDesk, id);
    expect(pending.ok && pending.value.consentStatus).toBe("PENDING");
    expect(pending.ok && pending.value.isComplete).toBe(false);

    // Consent is legal evidence: the runtime role cannot rewrite it.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      await expect(pool.query("UPDATE consent_record SET method = 'DIGITAL'")).rejects.toThrow(
        /permission denied/,
      );
      await expect(pool.query("DELETE FROM privacy_terms_version")).rejects.toThrow(/permission denied/);
    } finally {
      await pool.end();
    }
  });

  it("F05: consent files are validated, stored privately and opened through audited short links", async () => {
    const admin = await patientsContext("ADMINISTRATOR");
    await publishTerms(admin);
    const id = await createPatientOrThrow(admin);

    const text = await patients.storeConsentFile(admin, {
      bytes: new TextEncoder().encode("hello"),
      name: "a.txt",
    });
    expect(!text.ok && text.error.code).toBe("PATIENTS_INVALID_FILE");

    const upload = await patients.storeConsentFile(admin, { bytes: PDF, name: "termo-assinado.pdf" });
    expect(upload.ok).toBe(true);
    if (!upload.ok) return;
    const stored = await db().consentUpload.findUniqueOrThrow({ where: { id: upload.value.uploadToken } });
    expect(stored.objectKey).toBe(`org/${admin.organizationId}/patients/${upload.value.uploadToken}`);

    const recorded = await patients.recordConsent(admin, {
      patientId: id,
      method: "PAPER_UPLOADED",
      uploadToken: upload.value.uploadToken,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    const reused = await patients.recordConsent(admin, {
      patientId: id,
      method: "PAPER_UPLOADED",
      uploadToken: upload.value.uploadToken,
    });
    expect(!reused.ok && reused.error.code).toBe("PATIENTS_UPLOAD_NOT_FOUND");

    const link = await patients.getConsentFileUrl(admin, recorded.value.consentId);
    expect(link.ok).toBe(true);
    if (!link.ok) return;
    expect(new URL(link.value.url).searchParams.get("X-Amz-Expires")).toBe("300");
    const body = await (await fetch(link.value.url)).text();
    expect(body.startsWith("%PDF")).toBe(true);
    const reads = await auditEvents({ action: "READ_SENSITIVE", entityId: recorded.value.consentId });
    expect(reads).toHaveLength(1);
  });

  it("F05: terms can only be published by the administrator", async () => {
    const manager = await patientsContext("MANAGER");
    const denied = await patients.publishTermsVersion(manager, { text: "x".repeat(60) });
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");
  });
});
