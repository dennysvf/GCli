import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { professionals } from "@/modules/professionals";
import { db } from "@/shared/db/client";
import { auditEvents, closeHelpers, createUser, resetDatabase } from "../helpers";
import {
  contextFor,
  createProfessionalOrThrow,
  registration,
  fakeAppointments,
  orgDate,
  professionalsContext,
} from "./support";

beforeEach(resetDatabase);
afterEach(() => professionals.registerProfessionalAppointments(null));
afterAll(closeHelpers);

const vacation = (professionalId: string, overrides: Record<string, unknown> = {}) => ({
  professionalId,
  type: "VACATION",
  allDay: true,
  startsAt: orgDate(10),
  endsAt: orgDate(14),
  note: null,
  ...overrides,
});

describe("time-offs", () => {
  it("F04: a professional can create and delete their own time-offs but not others'", async () => {
    const admin = await professionalsContext();
    const user = await createUser({ organizationId: admin.organizationId, role: "PROFESSIONAL" });
    const own = await createProfessionalOrThrow(admin, { linkedUserId: user.id });
    const other = await createProfessionalOrThrow(admin, {
      registrations: [registration({ number: "654321" })],
    });
    const professional = await contextFor(user);
    expect(professional.linkedProfessionalId).toBe(own);

    const created = await professionals.createTimeOff(professional, vacation(own));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await auditEvents({ action: "CREATE", entityId: created.value.timeOffId })).toHaveLength(1);

    const denied = await professionals.createTimeOff(professional, vacation(other));
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");
    const denials = await auditEvents({ action: "PERMISSION_DENIED" });
    expect(denials.some((event) => (event.metadata as { target?: string }).target === other)).toBe(true);

    const othersTimeOff = await professionals.createTimeOff(admin, vacation(other));
    if (!othersTimeOff.ok) throw new Error("setup failed");
    const deleteOthers = await professionals.deleteTimeOff(professional, {
      timeOffId: othersTimeOff.value.timeOffId,
    });
    expect(!deleteOthers.ok && deleteOthers.error.code).toBe("AUTHZ_FORBIDDEN");

    const deleted = await professionals.deleteTimeOff(professional, { timeOffId: created.value.timeOffId });
    expect(deleted.ok).toBe(true);
    expect(await db().professionalTimeOff.count({ where: { professionalId: own } })).toBe(0);
    expect(await auditEvents({ action: "DELETE", entityId: created.value.timeOffId })).toHaveLength(1);

    const frontDesk = await professionalsContext("FRONT_DESK", admin.organizationId);
    const frontDeskCreate = await professionals.createTimeOff(frontDesk, vacation(own));
    expect(!frontDeskCreate.ok && frontDeskCreate.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("F04: a professional without a linked profile cannot manage time-offs", async () => {
    const admin = await professionalsContext();
    const id = await createProfessionalOrThrow(admin);
    const unlinked = await professionalsContext("PROFESSIONAL", admin.organizationId);
    const result = await professionals.createTimeOff(unlinked, vacation(id));
    expect(!result.ok && result.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("F04: a time-off overlapping appointments is saved and lists them", async () => {
    const ctx = await professionalsContext();
    const id = await createProfessionalOrThrow(ctx);
    const appointments = [
      {
        appointmentId: "a1",
        startsAt: "2026-12-22T17:30:00.000Z",
        unitName: "Unidade Centro",
        serviceName: "Consulta",
        patientName: "Maria O.",
      },
      {
        appointmentId: "a2",
        startsAt: "2026-12-23T13:00:00.000Z",
        unitName: "Unidade Centro",
        serviceName: "Retorno",
        patientName: "João P.",
      },
    ];
    professionals.registerProfessionalAppointments(fakeAppointments({ inPeriod: appointments }));
    const result = await professionals.createTimeOff(ctx, vacation(id));
    expect(result.ok && result.value.affectedAppointments).toEqual(appointments);
    expect(await db().professionalTimeOff.count()).toBe(1);
  });

  it("F04: time-offs must end within a year and not in the past", async () => {
    const ctx = await professionalsContext();
    const id = await createProfessionalOrThrow(ctx);
    const tooFar = await professionals.createTimeOff(
      ctx,
      vacation(id, { startsAt: orgDate(360), endsAt: orgDate(370) }),
    );
    expect(!tooFar.ok && tooFar.error.code).toBe("PROFESSIONALS_TIME_OFF_TOO_FAR");
    const past = await professionals.createTimeOff(
      ctx,
      vacation(id, { startsAt: orgDate(-5), endsAt: orgDate(-2) }),
    );
    expect(!past.ok && past.error.fields?.endsAt).toBe("A ausência não pode terminar no passado.");
    const partial = await professionals.createTimeOff(ctx, {
      professionalId: id,
      type: "PERSONAL",
      allDay: false,
      startsAt: `${orgDate(3)}T14:00`,
      endsAt: `${orgDate(3)}T16:30`,
      note: "Consulta médica",
    });
    expect(partial.ok).toBe(true);
    const list = await professionals.listTimeOffs(ctx, id);
    expect(list.ok && list.value.items.map((item) => [item.type, item.allDay, item.deletable])).toEqual([
      ["PERSONAL", false, true],
    ]);
  });
});
