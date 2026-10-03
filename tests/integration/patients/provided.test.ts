import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { patients } from "@/modules/patients";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { createPatientOrThrow, patientsContext, publishTerms, VALID_CPF, cpfDoc } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

describe("patients public API", () => {
  it("F05→F06/F08/F10: patient identity uses the social name where filled", async () => {
    const ctx = await patientsContext();
    const id = await createPatientOrThrow(ctx, {
      fullName: "João Pedro Silva",
      socialName: "Joana Silva",
      document: cpfDoc(VALID_CPF),
      address: {
        country: "BR",
        postalCode: "01310-100",
        street: "Avenida Paulista",
        number: "1000",
        complement: "Sala 12",
        district: "Bela Vista",
        city: "São Paulo",
        region: "SP",
      },
    });
    const identity = await patients.getPatientIdentity(ctx, id);
    expect(identity.ok).toBe(true);
    if (!identity.ok) return;
    expect(identity.value).toMatchObject({
      fullName: "João Pedro Silva",
      socialName: "Joana Silva",
      displayName: "Joana Silva",
      document: cpfDoc(VALID_CPF),
      birthDate: "1988-04-12",
      mobilePhone: "+5511988887777",
      active: true,
      formattedAddress: "Avenida Paulista, 1000 - Sala 12 - Bela Vista, São Paulo/SP - CEP 01310-100",
    });
  });

  it("F05→F12/F14: the record includes consents, registration data and the creation date", async () => {
    const admin = await patientsContext("ADMINISTRATOR", undefined, "Ana Admin");
    await publishTerms(admin);
    const id = await createPatientOrThrow(admin, { observations: "Prefere manhãs." });
    await patients.recordConsent(admin, { patientId: id, method: "DIGITAL" });

    const record = await patients.getPatientRecord(admin, id);
    expect(record.ok).toBe(true);
    if (!record.ok) return;
    expect(record.value.observations).toBe("Prefere manhãs.");
    expect(record.value.createdByName).toBe("Ana Admin");
    expect(Date.now() - new Date(record.value.createdAt).getTime()).toBeLessThan(60_000);
    expect(record.value.consents.map((consent) => [consent.termsVersion, consent.method])).toEqual([
      [1, "DIGITAL"],
    ]);
    expect(await auditEvents({ action: "CREATE", entityId: id })).toHaveLength(1);
  });
});
