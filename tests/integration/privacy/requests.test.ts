import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { closeHelpers, createOrganization, errorText, resetDatabase } from "../helpers";
import { schedulingWorld } from "../scheduling/support";
import { backdateRequest, privacy, privacyWorld, requestOrThrow, type PrivacyWorld } from "./support";

let world: PrivacyWorld;

beforeAll(async () => {
  await resetDatabase();
  world = await privacyWorld();
});
afterAll(closeHelpers);

const DAY = 24 * 60 * 60 * 1000;

async function list(input: Record<string, unknown> = {}) {
  const result = await privacy.listRequests(world.admin, input);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe("LGPD request register", () => {
  it("F14: an administrator records a request with date, requester, type and status", async () => {
    const created = await privacy.createRequest(world.admin, {
      patientId: world.patients.maria,
      type: "ACCESS",
      requestedBy: "PATIENT",
      description: "Paciente pediu cópia dos dados por e-mail.",
    });
    expect(created.ok && created.value.status).toBe("PENDING");
    if (!created.ok) return;
    const row = await db().lgpdRequest.findUniqueOrThrow({ where: { id: created.value.requestId } });
    expect(row).toMatchObject({
      type: "ACCESS",
      requestedBy: "PATIENT",
      status: "PENDING",
      completedAt: null,
      createdById: world.admin.user.id,
    });
    const listed = await list();
    const item = listed.items.find((entry) => entry.id === created.value.requestId);
    expect(item).toMatchObject({
      patientDisplayName: "Mari Oliveira",
      type: "ACCESS",
      requestedBy: "PATIENT",
      status: "PENDING",
      completedAt: null,
      daysOpen: 0,
      overdue: false,
    });
    expect(Date.now() - new Date(item?.createdAt ?? 0).getTime()).toBeLessThan(60_000);
  });

  it("F14: a request description shorter than 10 characters is rejected", async () => {
    const result = await privacy.createRequest(world.admin, {
      patientId: world.patients.maria,
      type: "ACCESS",
      requestedBy: "PATIENT",
      description: "Cópia",
    });
    expect(!result.ok && result.error.code).toBe("VALIDATION_FAILED");
    expect(!result.ok && result.error.fields?.description).toBe("privacy.validation.descriptionMin");
    expect(errorText("privacy", { code: "PRIVACY_NAME_MISMATCH" })).toBe("O nome digitado não confere.");
  });

  it("F14: only administrators can use the request register", async () => {
    const requestId = await requestOrThrow(world.admin, {
      patientId: world.patients.maria,
      type: "CORRECTION",
    });
    for (const ctx of [world.manager, world.desk, world.pro]) {
      const before = await db().auditEvent.count({
        where: { action: "PERMISSION_DENIED", actorUserId: ctx.user.id },
      });
      const results = await Promise.all([
        privacy.listRequests(ctx, {}),
        privacy.getRequest(ctx, requestId),
        privacy.createRequest(ctx, {
          patientId: world.patients.maria,
          type: "ACCESS",
          requestedBy: "PATIENT",
          description: "Pedido feito na recepção.",
        }),
        privacy.completeRequest(ctx, { requestId, resolution: "Dados corrigidos no cadastro." }),
        privacy.requestExport(ctx, { requestId }),
        privacy.getExportDownload(ctx, { exportId: newId() }),
      ]);
      for (const result of results) expect(!result.ok && result.error.code).toBe("AUTHZ_FORBIDDEN");
      const after = await db().auditEvent.count({
        where: { action: "PERMISSION_DENIED", actorUserId: ctx.user.id },
      });
      expect(after - before).toBe(results.length);
    }
  });

  it("F14: a second open anonymization request for the same patient is refused", async () => {
    await requestOrThrow(world.admin, { patientId: world.patients.joao, type: "ANONYMIZATION" });
    const second = await privacy.createRequest(world.admin, {
      patientId: world.patients.joao,
      type: "ANONYMIZATION",
      requestedBy: "GUARDIAN",
      description: "Responsável pediu a exclusão dos dados.",
    });
    expect(!second.ok && second.error.code).toBe("PRIVACY_ANONYMIZATION_REQUEST_OPEN");
    // The partial unique index refuses it whatever the application does.
    await expect(
      db().lgpdRequest.create({
        data: {
          id: newId(),
          organizationId: world.organizationId,
          patientId: world.patients.joao,
          type: "ANONYMIZATION",
          requestedBy: "PATIENT",
          description: "Pedido duplicado de exclusão.",
          createdById: world.admin.user.id,
        },
      }),
    ).rejects.toThrow();
    // Access and correction requests have no such limit.
    await requestOrThrow(world.admin, { patientId: world.patients.joao, type: "ACCESS" });
    await requestOrThrow(world.admin, { patientId: world.patients.joao, type: "ACCESS" });
  });

  it("F14: completing a correction request stores the completion date and the resolution", async () => {
    const requestId = await requestOrThrow(world.admin, {
      patientId: world.patients.maria,
      type: "CORRECTION",
    });
    const done = await privacy.completeRequest(world.admin, {
      requestId,
      resolution: "Telefone corrigido no cadastro.",
    });
    expect(done.ok && done.value.status).toBe("COMPLETED");
    const row = await db().lgpdRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row).toMatchObject({ status: "COMPLETED", resolution: "Telefone corrigido no cadastro." });
    expect(row.completedAt).not.toBeNull();
    expect(row.completedById).toBe(world.admin.user.id);
    const again = await privacy.completeRequest(world.admin, {
      requestId,
      resolution: "Outra resolução aqui.",
    });
    expect(!again.ok && again.error.code).toBe("PRIVACY_REQUEST_CLOSED");
    const short = await privacy.completeRequest(world.admin, { requestId, resolution: "Feito" });
    expect(!short.ok && short.error.fields?.resolution).toBe("privacy.validation.resolutionMin");
    const access = await requestOrThrow(world.admin, { patientId: world.patients.maria, type: "ACCESS" });
    const wrong = await privacy.completeRequest(world.admin, {
      requestId: access,
      resolution: "Não se aplica aqui.",
    });
    expect(!wrong.ok && wrong.error.code).toBe("PRIVACY_REQUEST_TYPE_MISMATCH");
  });

  it("F14: requests open for more than 15 days are flagged overdue", async () => {
    const overdue = await requestOrThrow(world.admin, { patientId: world.patients.maria, type: "ACCESS" });
    const day15 = await requestOrThrow(world.admin, { patientId: world.patients.maria, type: "CORRECTION" });
    const closedOld = await requestOrThrow(world.admin, {
      patientId: world.patients.maria,
      type: "CORRECTION",
    });
    await backdateRequest(overdue, new Date(Date.now() - 16 * DAY));
    await backdateRequest(day15, new Date(Date.now() - 15 * DAY));
    await backdateRequest(closedOld, new Date(Date.now() - 20 * DAY), new Date(Date.now() - 18 * DAY));

    const open = await list({ status: "OPEN" });
    const ids = open.items.map((item) => item.id);
    expect(open.items.find((item) => item.id === overdue)).toMatchObject({ overdue: true, daysOpen: 16 });
    expect(open.items.find((item) => item.id === day15)).toMatchObject({ overdue: false, daysOpen: 15 });
    expect(ids).not.toContain(closedOld);
    expect(ids.indexOf(overdue)).toBeLessThan(ids.indexOf(day15));
    expect(open.openOverdueCount).toBeGreaterThanOrEqual(1);

    const all = await list({ status: "ALL" });
    expect(all.items.find((item) => item.id === closedOld)).toMatchObject({
      overdue: false,
      status: "COMPLETED",
    });
    const detail = await privacy.getRequest(world.admin, overdue);
    expect(detail.ok && detail.value.overdue).toBe(true);
  });

  it("F14: every request change records an audit event", async () => {
    const requestId = await requestOrThrow(world.admin, {
      patientId: world.patients.maria,
      type: "CORRECTION",
    });
    await privacy.completeRequest(world.admin, { requestId, resolution: "Endereço atualizado no cadastro." });
    const events = await db().auditEvent.findMany({
      where: { entityId: requestId },
      orderBy: { occurredAt: "asc" },
    });
    expect(events.map((event) => event.action)).toEqual(["CREATE", "UPDATE"]);
    for (const event of events) {
      expect(event.entityType).toBe("lgpd_request");
      expect((event.metadata as { patientId: string }).patientId).toBe(world.patients.maria);
      expect(event.actorUserId).toBe(world.admin.user.id);
    }
  });

  it("F14: requests of another organization are never listed", async () => {
    const otherOrg = await createOrganization("Outra Clínica");
    const other = await schedulingWorld(otherOrg);
    const foreign = await requestOrThrow(other.admin, { patientId: other.patients.maria, type: "ACCESS" });
    const all = await list({ status: "ALL" });
    expect(all.items.map((item) => item.id)).not.toContain(foreign);
    const read = await privacy.getRequest(world.admin, foreign);
    expect(!read.ok && read.error.code).toBe("PRIVACY_REQUEST_NOT_FOUND");
    const cross = await privacy.createRequest(world.admin, {
      patientId: other.patients.maria,
      type: "ACCESS",
      requestedBy: "PATIENT",
      description: "Pedido de outro paciente.",
    });
    expect(!cross.ok && cross.error.code).toBe("PRIVACY_PATIENT_NOT_FOUND");
  });
});
