import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { professionals } from "@/modules/professionals";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import {
  auditEvents,
  closeHelpers,
  createOrganization,
  createUser,
  errorText,
  resetDatabase,
} from "../helpers";
import {
  createProfessionalOrThrow,
  createServiceOrThrow,
  fakeAppointments,
  cpfDocument,
  OTHER_CPF,
  registration,
  professionalInput,
  professionalsContext,
  VALID_CPF,
} from "./support";

beforeEach(resetDatabase);
afterEach(() => professionals.registerProfessionalAppointments(null));
afterAll(closeHelpers);

describe("professional profiles", () => {
  it("F04: a registration needs number and region, and Outro needs the council name", async () => {
    const ctx = await professionalsContext();
    const withRegistration = (overrides: Record<string, unknown>) =>
      professionalInput({ registrations: [registration(overrides)] });
    const noNumber = await professionals.createProfessional(ctx, withRegistration({ number: "" }));
    expect(noNumber.ok).toBe(false);
    if (!noNumber.ok) {
      expect(noNumber.error.code).toBe("VALIDATION_FAILED");
      expect(noNumber.error.fields?.["registrations.0.number"]).toBe(
        "professionals.validation.numberRequired",
      );
    }
    const noState = await professionals.createProfessional(ctx, withRegistration({ region: null }));
    expect(!noState.ok && noState.error.fields?.["registrations.0.region"]).toBe(
      "professionals.validation.regionRequired",
    );
    const other = await professionals.createProfessional(
      ctx,
      withRegistration({ councilType: "OTHER", councilOtherName: "" }),
    );
    expect(!other.ok && other.error.fields?.["registrations.0.councilOtherName"]).toBe(
      "professionals.validation.councilNameRequired",
    );

    // A professional without a council keeps no registration.
    const none = await professionals.createProfessional(
      ctx,
      professionalInput({
        hasNoCouncil: true,
        registrations: [registration({ number: "999", region: "RJ" })],
      }),
    );
    expect(none.ok).toBe(true);
    if (none.ok) {
      const row = await db().professional.findUniqueOrThrow({ where: { id: none.value.professionalId } });
      expect(row.hasNoCouncil).toBe(true);
      expect(await db().professionalRegistration.count({ where: { professionalId: row.id } })).toBe(0);
    }

    // The database enforces the rules too: one registration per country and a valid country.
    const id = await createProfessionalOrThrow(ctx, {
      fullName: "Com Registro",
      registrations: [registration({ number: "55" })],
    });
    const duplicate = {
      id: newId(),
      organizationId: ctx.organizationId,
      professionalId: id,
      country: "BR",
      councilType: "CRO",
      number: "77",
      region: "SP",
    };
    await expect(db().professionalRegistration.create({ data: duplicate })).rejects.toThrow();
    await expect(
      db().professionalRegistration.create({ data: { ...duplicate, country: "XX" } }),
    ).rejects.toThrow();
  });

  it("F04: administrator creates a professional with registration and audit", async () => {
    const ctx = await professionalsContext();
    const id = await createProfessionalOrThrow(ctx, { document: cpfDocument("529.982.247-25") });
    const details = await professionals.getProfessional(ctx, id);
    expect(details.ok).toBe(true);
    if (!details.ok) return;
    expect(details.value).toMatchObject({
      fullName: "Ana Paula Lima",
      registration: "CRM 123456/SP",
      document: { country: "BR", type: "CPF", number: VALID_CPF },
      phone: "+5511988887777",
      active: true,
      version: 1,
    });
    const [created] = await auditEvents({ action: "CREATE", entityId: id });
    expect(created?.actorUserId).toBe(ctx.user.id);
    expect(created?.entityType).toBe("professional");

    const list = await professionals.listProfessionals(ctx, {});
    expect(list.ok && list.value.map((item) => [item.displayName, item.initials])).toEqual([
      ["Dra. Ana Lima", "AL"],
    ]);
  });

  it("F04: invalid or duplicate document and duplicate council registration are rejected", async () => {
    const ctx = await professionalsContext();
    const invalid = await professionals.createProfessional(
      ctx,
      professionalInput({ document: cpfDocument("529.982.247-24") }),
    );
    expect(!invalid.ok && invalid.error.code).toBe("VALIDATION_FAILED");
    expect(!invalid.ok && invalid.error.fields?.["document.number"]).toBe(
      "validation.documentInvalid?type=CPF",
    );

    await createProfessionalOrThrow(ctx, { document: cpfDocument(VALID_CPF) });
    const sameCpf = await professionals.createProfessional(
      ctx,
      professionalInput({
        document: cpfDocument(VALID_CPF),
        registrations: [registration({ number: "777" })],
      }),
    );
    expect(!sameCpf.ok && sameCpf.error.code).toBe("PROFESSIONALS_DOCUMENT_TAKEN");

    const sameCouncil = await professionals.createProfessional(
      ctx,
      professionalInput({ document: cpfDocument(OTHER_CPF) }),
    );
    expect(!sameCouncil.ok && sameCouncil.error.code).toBe("PROFESSIONALS_COUNCIL_TAKEN");
    // The same number in another state is a different registration.
    expect(
      (
        await professionals.createProfessional(
          ctx,
          professionalInput({ registrations: [registration({ region: "RJ" })] }),
        )
      ).ok,
    ).toBe(true);
  });

  it("F04: a user cannot be linked to two professionals", async () => {
    const ctx = await professionalsContext();
    const user = await createUser({ organizationId: ctx.organizationId, role: "PROFESSIONAL" });
    await createProfessionalOrThrow(ctx, { linkedUserId: user.id });
    const second = await professionals.createProfessional(
      ctx,
      professionalInput({ registrations: [registration({ number: "654321" })], linkedUserId: user.id }),
    );
    expect(!second.ok && second.error.code).toBe("PROFESSIONALS_USER_ALREADY_LINKED");
    expect(!second.ok && second.error.fields?.linkedUserId).toBe(
      "professionals.errors.PROFESSIONALS_USER_ALREADY_LINKED",
    );

    // Concurrent links are settled by the unique index: exactly one succeeds.
    const other = await createUser({ organizationId: ctx.organizationId, role: "PROFESSIONAL" });
    const results = await Promise.all(
      ["111", "222", "333"].map((councilNumber) =>
        professionals.createProfessional(
          ctx,
          professionalInput({
            registrations: [registration({ number: councilNumber })],
            linkedUserId: other.id,
          }),
        ),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok).map((r) => !r.ok && r.error.code)).toEqual([
      "PROFESSIONALS_USER_ALREADY_LINKED",
      "PROFESSIONALS_USER_ALREADY_LINKED",
    ]);
  });

  it("F01→F04: only active users can be linked to a professional", async () => {
    const ctx = await professionalsContext();
    const inactive = await createUser({
      organizationId: ctx.organizationId,
      role: "PROFESSIONAL",
      status: "INACTIVE",
    });
    const frontDesk = await createUser({ organizationId: ctx.organizationId, role: "FRONT_DESK" });
    for (const user of [inactive, frontDesk]) {
      const result = await professionals.createProfessional(
        ctx,
        professionalInput({ linkedUserId: user.id }),
      );
      expect(!result.ok && result.error.code).toBe("PROFESSIONALS_USER_NOT_LINKABLE");
    }
    const { listLinkableUsers } = await import("@/modules/identity");
    const linkable = await listLinkableUsers(ctx);
    expect(linkable.map((user) => user.id)).not.toContain(inactive.id);
    expect(linkable.map((user) => user.id)).not.toContain(frontDesk.id);
  });

  it("F04: deactivation is blocked while future non-cancelled appointments exist", async () => {
    const ctx = await professionalsContext();
    const id = await createProfessionalOrThrow(ctx);
    professionals.registerProfessionalAppointments(fakeAppointments({ future: 23 }));
    const blocked = await professionals.setProfessionalActive(ctx, { professionalId: id, active: false });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe("PROFESSIONALS_HAS_FUTURE_APPOINTMENTS");
      expect(errorText("professionals", blocked.error)).toBe(
        "Existem 23 agendamentos futuros. Reagende ou cancele antes de desativar.",
      );
    }
    expect((await db().professional.findUniqueOrThrow({ where: { id } })).active).toBe(true);

    professionals.registerProfessionalAppointments(null);
    expect((await professionals.setProfessionalActive(ctx, { professionalId: id, active: false })).ok).toBe(
      true,
    );
    const row = await db().professional.findUniqueOrThrow({ where: { id } });
    expect(row.active).toBe(false);
    expect(row.deactivatedAt).not.toBeNull();
    const audits = await auditEvents({ action: "UPDATE", entityId: id });
    expect(audits.at(-1)?.summary).toBe("Profissional desativado");

    const edit = await professionals.updateProfessional(ctx, {
      ...professionalInput(),
      professionalId: id,
      version: 2,
    });
    expect(!edit.ok && edit.error.code).toBe("PROFESSIONALS_INACTIVE");
  });

  it("F04: the 101st active professional is rejected", async () => {
    const ctx = await professionalsContext();
    await db().professional.createMany({
      data: Array.from({ length: 100 }, (_, index) => ({
        id: newId(),
        organizationId: ctx.organizationId,
        fullName: `Profissional ${index}`,
        color: "blue",
      })),
    });
    const extra = await professionals.createProfessional(ctx, professionalInput());
    expect(!extra.ok && extra.error.code).toBe("PROFESSIONALS_LIMIT");

    const inactiveId = newId();
    await db().professional.create({
      data: {
        id: inactiveId,
        organizationId: ctx.organizationId,
        fullName: "Inativo",
        color: "red",
        active: false,
      },
    });
    const reactivate = await professionals.setProfessionalActive(ctx, {
      professionalId: inactiveId,
      active: true,
    });
    expect(!reactivate.ok && reactivate.error.code).toBe("PROFESSIONALS_LIMIT");
  });

  it("F04: removing an enabled service keeps future appointments and reports the count", async () => {
    const ctx = await professionalsContext();
    const id = await createProfessionalOrThrow(ctx);
    const first = await createServiceOrThrow(ctx, "Consulta");
    const second = await createServiceOrThrow(ctx, "Retorno");
    const enabled = await professionals.replaceEnabledServices(ctx, {
      professionalId: id,
      version: 1,
      serviceIds: [first, second],
    });
    expect(enabled.ok && enabled.value).toMatchObject({
      version: 2,
      added: 2,
      removed: 0,
      keptAppointments: 0,
    });

    professionals.registerProfessionalAppointments(fakeAppointments({ forServices: 4 }));
    const removed = await professionals.replaceEnabledServices(ctx, {
      professionalId: id,
      version: 2,
      serviceIds: [first],
    });
    expect(removed.ok && removed.value).toMatchObject({ removed: 1, keptAppointments: 4 });
    const current = await professionals.getEnabledServices(ctx, id);
    expect(current.ok && current.value.serviceIds).toEqual([first]);
  });

  it("F03→F04: only active services can be enabled for a professional", async () => {
    const ctx = await professionalsContext();
    const id = await createProfessionalOrThrow(ctx);
    const serviceId = await createServiceOrThrow(ctx);
    const { services } = await import("@/modules/services");
    await professionals.replaceEnabledServices(ctx, {
      professionalId: id,
      version: 1,
      serviceIds: [serviceId],
    });
    await services.setServiceActive(ctx, { serviceId, active: false });

    const rejected = await professionals.replaceEnabledServices(ctx, {
      professionalId: id,
      version: 2,
      serviceIds: [serviceId],
    });
    expect(!rejected.ok && rejected.error.code).toBe("PROFESSIONALS_INVALID_SERVICES");
    const current = await professionals.getEnabledServices(ctx, id);
    expect(current.ok && current.value).toEqual({
      serviceIds: [],
      inactiveServices: [{ id: serviceId, name: "Consulta dermatológica" }],
    });
  });

  it("F04: stale versions are rejected", async () => {
    const ctx = await professionalsContext();
    const id = await createProfessionalOrThrow(ctx);
    const first = await professionals.updateProfessional(ctx, {
      ...professionalInput({ specialty: "Dermatologia clínica" }),
      professionalId: id,
      version: 1,
    });
    expect(first.ok).toBe(true);
    const second = await professionals.updateProfessional(ctx, {
      ...professionalInput({ specialty: "Tricologia" }),
      professionalId: id,
      version: 1,
    });
    expect(!second.ok && second.error.code).toBe("CONFLICT_STALE_VERSION");
  });

  it("F04: front desk can read professionals but not change them", async () => {
    const admin = await professionalsContext();
    const id = await createProfessionalOrThrow(admin);
    const frontDesk = await professionalsContext("FRONT_DESK", admin.organizationId);
    expect((await professionals.listProfessionals(frontDesk, {})).ok).toBe(true);
    expect((await professionals.getProfessional(frontDesk, id)).ok).toBe(true);
    const create = await professionals.createProfessional(
      frontDesk,
      professionalInput({ registrations: [registration({ number: "1" })] }),
    );
    expect(!create.ok && create.error.code).toBe("AUTHZ_FORBIDDEN");
    const deactivate = await professionals.setProfessionalActive(frontDesk, {
      professionalId: id,
      active: false,
    });
    expect(!deactivate.ok && deactivate.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("F04: professionals are isolated per organization", async () => {
    const ctx = await professionalsContext();
    const id = await createProfessionalOrThrow(ctx);
    const other = await professionalsContext("ADMINISTRATOR", await createOrganization("Outra Clínica"));
    const list = await professionals.listProfessionals(other, { status: "all" });
    expect(list.ok && list.value).toEqual([]);
    expect((await professionals.getProfessional(other, id)).ok).toBe(false);
    const update = await professionals.updateProfessional(other, {
      ...professionalInput(),
      professionalId: id,
      version: 1,
    });
    expect(!update.ok && update.error.code).toBe("PROFESSIONALS_NOT_FOUND");
    // The same registration is free in another organization.
    expect((await professionals.createProfessional(other, professionalInput())).ok).toBe(true);
  });

  it("F04: the runtime role cannot bypass the unique link even with raw SQL", async () => {
    const ctx = await professionalsContext();
    const user = await createUser({ organizationId: ctx.organizationId, role: "MANAGER" });
    await createProfessionalOrThrow(ctx, { linkedUserId: user.id });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      await expect(
        pool.query(
          `INSERT INTO professional (id, organization_id, full_name, color, linked_user_id, updated_at)
           VALUES ($1, $2, 'Outro', 'blue', $3, now())`,
          [newId(), ctx.organizationId, user.id],
        ),
      ).rejects.toThrow(/uq_professional_linked_user/);
    } finally {
      await pool.end();
    }
  });
});
