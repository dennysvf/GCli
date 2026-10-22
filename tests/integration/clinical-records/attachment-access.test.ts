import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/shared/context/types";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { appointmentFor, clinicalWorld, insertNote, type ClinicalWorld } from "./support";
import { PDF_BYTES, uploadAttachment } from "./uploads";

// The download Route Handler reads the session through identity/next, which needs a Next.js
// request; the test hands it the context of a signed-in fixture user instead.
const session = vi.hoisted(() => ({ ctx: null as RequestContext | null }));
vi.mock("@/modules/identity/next", () => ({ getRequestContext: async () => session.ctx }));

const { GET: downloadRoute } = await import("@/app/api/clinical/attachments/[attachmentId]/route");
const { clinicalRecords } = await import("@/modules/clinical-records");

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: ClinicalWorld;
let attachmentId: string;
beforeEach(async () => {
  world = await clinicalWorld();
  session.ctx = null;
  // A finalized note of Ana with Maria, still inside the 24-hour window, so the attachment is
  // visible to every reader with access: the only reason left to refuse is the access rule itself.
  const appointmentId = await appointmentFor(world);
  const note = await insertNote(world, { appointmentId, status: "FINALIZED" });
  const uploaded = await uploadAttachment(world.pro, note.id, {
    name: "laudo.pdf",
    contentType: "application/pdf",
    bytes: PDF_BYTES,
  });
  if (!uploaded.result.ok) throw new Error(`upload failed: ${uploaded.result.error.code}`);
  attachmentId = uploaded.result.value.attachmentId;
});

const download = (id: string, variant?: string) =>
  downloadRoute(
    new Request(
      `http://localhost:3001/api/clinical/attachments/${id}${variant ? `?variant=${variant}` : ""}`,
    ),
    { params: Promise.resolve({ attachmentId: id }) },
  );

const denialsOf = async (userId: string) =>
  (await auditEvents({ action: "PERMISSION_DENIED" })).filter((event) => event.actorUserId === userId);

const attachmentReads = async () =>
  (await auditEvents({ action: "READ_SENSITIVE" })).filter(
    (event) => event.entityType === "clinical_attachment",
  );

describe("clinical attachment URLs", () => {
  it("F07: a professional without any appointment with the patient gets 403 on the attachment URL, and the denial is audited", async () => {
    // Bruno is a professional in the same clinic who never had an appointment with Maria.
    const bruno = world.brunoPro;
    expect(bruno.linkedProfessionalId).toBe(world.professionals.bruno);

    const direct = await clinicalRecords.openAttachment(bruno, { attachmentId });
    expect(!direct.ok && direct.error.code).toBe("AUTHZ_FORBIDDEN");

    session.ctx = bruno;
    for (const variant of [undefined, "original", "converted"]) {
      const response = await download(attachmentId, variant);
      expect(response.status).toBe(403);
      expect(response.headers.get("Location")).toBeNull();
      const body = await response.json();
      expect(body).toEqual({ code: "AUTHZ_FORBIDDEN" });
      expect(JSON.stringify(body)).not.toContain("X-Amz");
    }

    const denials = await denialsOf(bruno.user.id);
    // One for the use case call and one per route request.
    expect(denials).toHaveLength(4);
    for (const event of denials) {
      expect(event.metadata).toMatchObject({ permission: "clinical:read", target: world.patients.maria });
    }
    // A refused opening is not a clinical read.
    expect(await attachmentReads()).toHaveLength(0);
  });

  it("F07: administrators and managers without a professional link, and the front desk, get 403 on the attachment URL", async () => {
    for (const ctx of [world.admin, world.manager, world.desk]) {
      expect(ctx.linkedProfessionalId).toBeFalsy();
      session.ctx = ctx;
      const response = await download(attachmentId);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: "AUTHZ_FORBIDDEN" });
      const denials = await denialsOf(ctx.user.id);
      expect(denials).toHaveLength(1);
      expect(denials[0]?.metadata).toMatchObject({ target: world.patients.maria });
    }
    expect(await attachmentReads()).toHaveLength(0);
  });

  it("F07: the professional with an appointment with the patient is redirected to the 5-minute URL, and the opening is audited", async () => {
    session.ctx = world.pro;
    const response = await download(attachmentId);
    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(new URL(location).searchParams.get("X-Amz-Expires")).toBe("300");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await denialsOf(world.pro.user.id)).toHaveLength(0);
    const reads = await attachmentReads();
    expect(reads).toHaveLength(1);
    expect(reads[0]?.entityId).toBe(attachmentId);
  });

  it("F07: without a session the attachment URL answers 401", async () => {
    const response = await download(attachmentId);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "AUTH_UNAUTHENTICATED" });
  });
});
