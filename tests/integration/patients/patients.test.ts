import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { patients } from "@/modules/patients";
import { professionals } from "@/modules/professionals";
import { db } from "@/shared/db/client";
import { auditEvents, closeHelpers, errorText, createUser, resetDatabase, signedInContext } from "../helpers";
import {
  birthDateForAge,
  createPatientOrThrow,
  fakeAppointments,
  OTHER_CPF,
  patientInput,
  patientsContext,
  VALID_CPF,
  cpfDoc,
} from "./support";

beforeEach(resetDatabase);
afterEach(() => patients.registerPatientAppointments(null));
afterAll(closeHelpers);

const message = (error: { code: string; params?: Record<string, string | number> | undefined }) =>
  errorText("patients", error);

describe("patient registration", () => {
  it("F05: a patient cannot be saved without full name, birth date and mobile phone", async () => {
    const ctx = await patientsContext();
    const empty = await patients.createPatient(ctx, { mode: "quick" });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(empty.error.fields ?? {})).toEqual(
        expect.arrayContaining(["fullName", "birthDate", "mobilePhone"]),
      );
    }
    const landline = await patients.createPatient(ctx, patientInput({ mobilePhone: "(11) 3333-4444" }));
    expect(!landline.ok && landline.error.fields?.mobilePhone).toBe("validation.mobileInvalid");

    const quick = await patients.createPatient(ctx, {
      mode: "quick",
      fullName: "Pedro Alves",
      birthDate: "1990-01-01",
      mobilePhone: "11977776666",
    });
    expect(quick.ok && quick.value.kind).toBe("created");
    const [created] = await auditEvents({ action: "CREATE" }).then((events) =>
      events.filter((event) => event.entityType === "patient"),
    );
    expect(created?.summary).toBe("Paciente cadastrado (cadastro rápido)");
  });

  it("F05: an invalid CPF is rejected and an existing CPF blocks the save with a link", async () => {
    const ctx = await patientsContext();
    const invalid = await patients.createPatient(ctx, patientInput({ document: cpfDoc("529.982.247-24") }));
    expect(!invalid.ok && invalid.error.code).toBe("VALIDATION_FAILED");
    expect(!invalid.ok && invalid.error.fields?.["document.number"]).toBe(
      "validation.documentInvalid?type=CPF",
    );

    const existing = await createPatientOrThrow(ctx, { document: cpfDoc(VALID_CPF) });
    const taken = await patients.createPatient(
      ctx,
      patientInput({ fullName: "Joana Prado", document: cpfDoc("529.982.247-25"), birthDate: "1975-02-02" }),
    );
    expect(taken.ok).toBe(false);
    if (!taken.ok) {
      expect(taken.error.code).toBe("PATIENTS_DOCUMENT_TAKEN");
      expect(message(taken.error)).toBe("Este CPF já está cadastrado para Maria S. Oliveira.");
      expect(taken.error.fields?.existingPatientId).toBe(existing);
    }

    // Concurrent saves of the same CPF settle on the unique index.
    const results = await Promise.all(
      ["Lia Costa", "Rui Costa", "Ivo Costa"].map((fullName) =>
        patients.createPatient(
          ctx,
          patientInput({ fullName, document: cpfDoc(OTHER_CPF), confirmDuplicate: true }),
        ),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    for (const result of results.filter((item) => !item.ok)) {
      expect(!result.ok && result.error.code).toBe("PATIENTS_DOCUMENT_TAKEN");
    }
  });

  it("F05: the same name and birth date warns and allows creating anyway", async () => {
    const ctx = await patientsContext();
    const first = await createPatientOrThrow(ctx, { document: cpfDoc(VALID_CPF) });
    const warned = await patients.createPatient(ctx, patientInput({ fullName: "  MARIA silva oliveira " }));
    expect(warned.ok).toBe(true);
    if (!warned.ok || warned.value.kind !== "possible-duplicates") throw new Error("expected a warning");
    expect(warned.value.candidates).toEqual([
      {
        patientId: first,
        displayName: "Maria Silva Oliveira",
        birthDate: "1988-04-12",
        maskedDocument: { type: "CPF", display: "***.***.247-25" },
        phoneEnd: "7777",
        active: true,
      },
    ]);
    expect(await db().patient.count()).toBe(1);

    const confirmed = await patients.createPatient(ctx, patientInput({ confirmDuplicate: true }));
    expect(confirmed.ok && confirmed.value.kind).toBe("created");
    if (!confirmed.ok || confirmed.value.kind !== "created") return;
    const [audit] = await auditEvents({ action: "CREATE", entityId: confirmed.value.patientId });
    expect(audit?.metadata).toEqual({ duplicateConfirmed: true });
  });

  it("F05: a patient under 18 cannot be saved without a guardian", async () => {
    const ctx = await patientsContext();
    const minor = patientInput({ fullName: "Lucas Prado", birthDate: birthDateForAge(17, 364) });
    const missing = await patients.createPatient(ctx, minor);
    expect(!missing.ok && missing.error.code).toBe("PATIENTS_GUARDIAN_REQUIRED");
    expect(!missing.ok && message(missing.error)).toBe(
      "Pacientes menores de 18 anos precisam de um responsável cadastrado.",
    );
    const withGuardian = await patients.createPatient(ctx, {
      ...minor,
      guardian: { name: "Carla Prado", relationship: "MOTHER", phone: "(11) 97777-6666" },
    });
    expect(withGuardian.ok && withGuardian.value.kind).toBe("created");
    const adult = await patients.createPatient(
      ctx,
      patientInput({ fullName: "Davi Rocha", birthDate: birthDateForAge(18) }),
    );
    expect(adult.ok && adult.value.kind).toBe("created");
  });

  it("F05: a concurrent edit is detected and the second save does not overwrite the first", async () => {
    const first = await patientsContext("FRONT_DESK", undefined, "João Lima");
    const second = await patientsContext("MANAGER", first.organizationId, "Bia Reis");
    const id = await createPatientOrThrow(first);
    const edit = (ctx: typeof first, email: string) =>
      patients.updatePatient(ctx, { ...patientInput({ email }), patientId: id, version: 1 });
    expect((await edit(first, "nova@exemplo.com.br")).ok).toBe(true);
    const stale = await edit(second, "outra@exemplo.com.br");
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error.code).toBe("PATIENTS_STALE_VERSION");
      expect(message(stale.error)).toMatch(
        /^Este cadastro foi alterado por João Lima às \d{2}:\d{2}\. Revise as alterações antes de salvar\.$/,
      );
    }
    expect((await db().patient.findUniqueOrThrow({ where: { id } })).email).toBe("nova@exemplo.com.br");
  });

  it("F05: deactivation is blocked by future appointments and hides the patient from booking search", async () => {
    const ctx = await patientsContext();
    const id = await createPatientOrThrow(ctx);
    patients.registerPatientAppointments(fakeAppointments({ future: 3 }));
    const blocked = await patients.setPatientActive(ctx, { patientId: id, active: false, reason: "MOVED" });
    expect(!blocked.ok && message(blocked.error)).toBe(
      "O paciente possui 3 agendamentos futuros. Cancele-os antes de inativar.",
    );
    patients.registerPatientAppointments(null);
    expect((await patients.setPatientActive(ctx, { patientId: id, active: false, reason: "MOVED" })).ok).toBe(
      true,
    );

    const active = await patients.searchPatients(ctx, { q: "maria" });
    expect(active.ok && active.value.total).toBe(0);
    const all = await patients.searchPatients(ctx, { q: "maria", status: "all" });
    expect(all.ok && all.value.items.map((item) => item.active)).toEqual([false]);
    expect((await patients.getPatient(ctx, id)).ok).toBe(true);
    const edit = await patients.updatePatient(ctx, { ...patientInput(), patientId: id, version: 2 });
    expect(!edit.ok && edit.error.code).toBe("PATIENTS_INACTIVE");
  });

  it("F05: a professional only sees patients with an appointment with them", async () => {
    const admin = await patientsContext("ADMINISTRATOR");
    const seen = await createPatientOrThrow(admin, { fullName: "Maria Visivel" });
    const hidden = await createPatientOrThrow(admin, { fullName: "Maria Oculta" });
    const user = await createUser({ organizationId: admin.organizationId, role: "PROFESSIONAL" });
    const created = await professionals.createProfessional(admin, {
      fullName: "Paula Prado",
      councilType: "NONE",
      color: "teal",
      linkedUserId: user.id,
    });
    if (!created.ok) throw new Error("setup failed");
    const professional = (await signedInContext(user)).ctx;

    expect((await patients.searchPatients(professional, { q: "maria" })).ok && true).toBe(true);
    const none = await patients.searchPatients(professional, { q: "maria" });
    expect(none.ok && none.value.items).toEqual([]);

    patients.registerPatientAppointments(fakeAppointments({ visible: [seen] }));
    const found = await patients.searchPatients(professional, { q: "maria" });
    expect(found.ok && found.value.items.map((item) => item.id)).toEqual([seen]);
    expect((await patients.getPatient(professional, seen)).ok).toBe(true);
    const forbidden = await patients.getPatient(professional, hidden);
    expect(!forbidden.ok && forbidden.error.code).toBe("AUTHZ_FORBIDDEN");
    const update = await patients.updatePatient(professional, {
      ...patientInput(),
      patientId: seen,
      version: 1,
    });
    expect(!update.ok && update.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("F05: tags are limited to 10 active items per patient", async () => {
    const admin = await patientsContext("ADMINISTRATOR");
    const tagIds: string[] = [];
    for (let index = 0; index < 11; index++) {
      const created = await patients.createListItem(admin, { list: "tag", name: `Etiqueta ${index}` });
      if (!created.ok) throw new Error("setup failed");
      tagIds.push(created.value.id);
    }
    const tooMany = await patients.createPatient(admin, patientInput({ tagIds }));
    expect(!tooMany.ok && tooMany.error.code).toBe("PATIENTS_TAG_LIMIT");
    const lastTag = tagIds[10] ?? "";
    await patients.setListItemActive(admin, { list: "tag", id: lastTag, active: false });
    const inactive = await patients.createPatient(admin, patientInput({ tagIds: [lastTag] }));
    expect(!inactive.ok && inactive.error.code).toBe("PATIENTS_INVALID_OPTION");
    const ok = await patients.createPatient(admin, patientInput({ tagIds: tagIds.slice(0, 10) }));
    expect(ok.ok && ok.value.kind).toBe("created");

    const duplicate = await patients.createListItem(admin, { list: "tag", name: "etiqueta 0" });
    expect(!duplicate.ok && duplicate.error.code).toBe("PATIENTS_LIST_NAME_TAKEN");
    const frontDesk = await patientsContext("FRONT_DESK", admin.organizationId);
    const denied = await patients.createListItem(frontDesk, { list: "referral-source", name: "Instagram" });
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");
  });
});
