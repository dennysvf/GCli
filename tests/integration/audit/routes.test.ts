import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/shared/context/types";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { auditWorld, daysAgo, seedEvents, today, type AuditWorld } from "./support";

// The Route Handlers read the session through identity/next, which needs a Next.js request; the
// test hands them the context of a signed-in fixture user instead (or none).
const session = vi.hoisted(() => ({ ctx: null as RequestContext | null }));
vi.mock("@/modules/identity/next", () => ({ getRequestContext: async () => session.ctx }));

const { GET: searchRoute } = await import("@/app/api/audit/events/route");
const { GET: detailRoute } = await import("@/app/api/audit/events/[eventId]/route");
const { GET: exportRoute } = await import("@/app/api/audit/export/route");

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: AuditWorld;
beforeEach(async () => {
  world = await auditWorld();
  session.ctx = null;
});

const request = (path: string) => new Request(`http://localhost:3001${path}`);
const detail = (id: string) =>
  detailRoute(request(`/api/audit/events/${id}`), { params: Promise.resolve({ eventId: id }) });

describe("audit endpoints", () => {
  it("F15: the export endpoint returns 401 without a session and 403 for Manager", async () => {
    for (const response of [
      await searchRoute(request("/api/audit/events")),
      await detail(world.events.patientUpdate),
      await exportRoute(request("/api/audit/export")),
    ]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ code: "AUTH_UNAUTHENTICATED" });
    }
    session.ctx = world.manager;
    const manager = await exportRoute(request("/api/audit/export"));
    expect(manager.status).toBe(403);
    expect(manager.headers.get("Content-Type")).toContain("application/json");
  });

  it("F15: other roles get 403 from every endpoint and each refusal is audited", async () => {
    for (const ctx of [world.manager, world.desk, world.pro]) {
      session.ctx = ctx;
      for (const response of [
        await searchRoute(request("/api/audit/events")),
        await detail(world.events.patientUpdate),
        await exportRoute(request("/api/audit/export")),
      ]) {
        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.code).toBe("AUTHZ_FORBIDDEN");
        expect(JSON.stringify(body)).not.toContain(world.events.patientUpdate);
      }
    }
    const denials = (await auditEvents({ action: "PERMISSION_DENIED" })).filter(
      (event) =>
        event.id !== world.events.denied &&
        (event.metadata as { permission?: string } | null)?.permission === "audit:read",
    );
    // One per user and endpoint (nine requests); the fixture ev-denied is not one of them.
    expect(denials).toHaveLength(9);
  });

  it("F15: search, detail and export answer the administrator with JSON and the CSV", async () => {
    session.ctx = world.admin;
    const search = await searchRoute(request("/api/audit/events?entityType=patient"));
    expect(search.status).toBe(200);
    expect(search.headers.get("Cache-Control")).toBe("private, no-store");
    const page = await search.json();
    expect(page).toMatchObject({ pageSize: 100, exportLimit: 100000, timeZone: "America/Sao_Paulo" });

    const tooLong = await searchRoute(request(`/api/audit/events?from=${daysAgo(400)}&to=${today()}`));
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toMatchObject({
      code: "AUDIT_PERIOD_TOO_LONG",
      message: "O período deve ter no máximo 366 dias.",
    });

    const missing = await detail(world.evBUpdate);
    expect(missing.status).toBe(404);
    const missingBody = await missing.json();
    expect(missingBody).toMatchObject({ code: "AUDIT_EVENT_NOT_FOUND" });
    expect(JSON.stringify(missingBody)).not.toContain("Outra");

    const csv = await exportRoute(request("/api/audit/export?entityType=clinical_note"));
    expect(csv.status).toBe(200);
    expect(csv.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(csv.headers.get("Content-Disposition")).toBe(
      `attachment; filename="auditoria-${daysAgo(29)}-${today()}.csv"`,
    );
    expect(csv.headers.get("X-Report-Rows")).toBe("2");
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("F15: an export above the limit answers 422 with a JSON message", async () => {
    await seedEvents({
      organizationId: world.orgA,
      count: 100_001,
      from: new Date(`${daysAgo(2)}T03:00:01Z`),
      to: new Date(`${daysAgo(1)}T02:59:59Z`),
      action: "LOGIN",
      actorUserId: world.admin.user.id,
    });
    session.ctx = world.admin;
    const response = await exportRoute(
      request(`/api/audit/export?from=${daysAgo(2)}&to=${daysAgo(2)}&action=LOGIN`),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe("AUDIT_EXPORT_TOO_LARGE");
    expect(body.message).toContain("A exportação em CSV aceita até 100.000 linhas.");
    const exports = (await auditEvents({ action: "EXPORT" })).filter(
      (event) => event.entityType === "audit_log",
    );
    expect(exports).toHaveLength(0);
  }, 180_000);
});
