import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RequestContext } from "@/shared/context/types";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { closeHelpers, createOrganization, createUser, resetDatabase, signedInContext } from "../helpers";
import { audit, createPastPartitions, daysAgo, today } from "./support";

// PRD F15: filters answer within 3 seconds at p95 with 1 million events (contract API-PERF-01). The
// audit-load set: 1,000,000 events over the 12 months that end three days ago, every action, 24 entity
// types, 60 actors plus system events, about 30% with changes, and one patient with 400 events.
// 20 runs per combination, the first one a warm-up. Set AUDIT_PLANS=1 to print the query plans.
const RUNS = 20;
const P95_MS = 3_000;
const EVENTS = 1_000_000;

const ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "READ_SENSITIVE",
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET",
  "PERMISSION_DENIED",
  "EXPORT",
];
const TYPES = [
  "patient",
  "appointment",
  "clinical_note",
  "charge",
  "payment",
  "cash_register",
  "user",
  "organization",
  "unit",
  "room",
  "service",
  "professional",
  "consent_record",
  "patient_document",
  "document_template",
  "financial_entry",
  "cash_movement",
  "patient_package",
  "lgpd_request",
  "invitation",
  "service_category",
  "professional_schedule",
  "appointment_series",
  "clinical_attachment",
];

let admin: RequestContext;
let actorId = "";
const loadPatientId = newId();

beforeAll(async () => {
  await resetDatabase();
  await createPastPartitions(13);
  const org = await createOrganization("Clínica Carga");
  const user = await createUser({ organizationId: org, role: "ADMINISTRATOR", name: "Admin Carga" });
  admin = (await signedInContext(user)).ctx;
  const actors: string[] = [];
  for (let index = 0; index < 60; index++) {
    actors.push((await createUser({ organizationId: org, name: `Pessoa ${index}` })).id);
  }
  actorId = actors[7] ?? "";
  const end = new Date(`${daysAgo(3)}T23:00:00Z`).getTime();
  const span = 365 * 24 * 60 * 60 * 1000;
  // Rare actions (permission denied, exports) stay rare: actions are drawn with a skewed modulo.
  await db().$executeRaw`
    INSERT INTO audit_event (id, occurred_at, organization_id, actor_type, actor_user_id, action, entity_type,
      entity_id, summary, changes, ip_address, request_id)
    SELECT gen_random_uuid(),
      to_timestamp(${(end - span) / 1000}::float8 + (g::float8 / ${EVENTS}) * ${span / 1000}::float8),
      ${org}::uuid,
      CASE WHEN g % 10 = 0 THEN 'SYSTEM' ELSE 'USER' END,
      CASE WHEN g % 10 = 0 THEN NULL ELSE (${actors}::uuid[])[1 + (g % 60)] END,
      (${ACTIONS}::text[])[1 + ((g * 7) % 97) % 11],
      CASE WHEN g % 2500 = 0 THEN 'patient' ELSE (${TYPES}::text[])[1 + (g % 24)] END,
      CASE WHEN g % 2500 = 0 THEN ${loadPatientId}::uuid ELSE gen_random_uuid() END,
      'Evento de carga',
      CASE WHEN g % 10 < 3 THEN jsonb_build_object('status', jsonb_build_object('before', 'A', 'after', 'B')) END,
      '203.0.113.7'::inet, 'carga'
    FROM generate_series(1, ${EVENTS}::int) AS g`;
  await db().$executeRaw`ANALYZE audit_event`.catch(() => undefined);
}, 1_800_000);

afterAll(closeHelpers);

async function p95(input: Record<string, unknown>): Promise<number> {
  const times: number[] = [];
  for (let run = 0; run <= RUNS; run++) {
    const start = performance.now();
    const result = await audit.searchEvents(admin, input);
    const elapsed = performance.now() - start;
    if (!result.ok) throw new Error(result.error.code);
    if (run > 0) times.push(elapsed);
  }
  times.sort((a, b) => a - b);
  return times[Math.ceil(times.length * 0.95) - 1] ?? Infinity;
}

describe("audit log performance", () => {
  it("F15: each filter combination answers within 3 seconds at p95 with 1 million events", async () => {
    const period = { from: daysAgo(365), to: today() };
    const first = await audit.searchEvents(admin, period);
    if (!first.ok) throw new Error(first.error.code);
    expect(first.value.items).toHaveLength(100);
    expect(first.value.matched.capped).toBe(true);
    const combinations: Record<string, Record<string, unknown>> = {
      period: period,
      user: { ...period, user: actorId },
      action: { ...period, action: "PERMISSION_DENIED" },
      entityType: { ...period, entityType: "patient" },
      entity: { ...period, entityType: "patient", entityId: loadPatientId },
      combined: { ...period, user: actorId, action: "UPDATE", entityType: "charge" },
      secondPage: { ...period, cursor: first.value.nextCursor },
    };
    const results: Record<string, number> = {};
    for (const [name, input] of Object.entries(combinations)) {
      const page = await audit.searchEvents(admin, input);
      if (!page.ok) throw new Error(`${name}: ${page.error.code}`);
      for (const item of page.value.items) {
        if (input.user) expect(item.actor.userId).toBe(input.user);
        if (input.action) expect(item.action).toBe(input.action);
        if (input.entityType) expect(item.entityType).toBe(input.entityType);
        if (input.entityId) expect(item.entityId).toBe(input.entityId);
      }
      if (page.value.matched.count > 100) expect(page.value.items).toHaveLength(100);
      results[name] = await p95(input);
    }
    console.log("F15 p95 (ms)", JSON.stringify(results));
    if (process.env.AUDIT_PLANS === "1") {
      const plan = await db().$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
        `EXPLAIN ANALYZE SELECT id FROM audit_event WHERE organization_id = $1::uuid AND action = 'PERMISSION_DENIED'
         AND occurred_at >= $2::timestamptz ORDER BY occurred_at DESC, id DESC LIMIT 101`,
        admin.organizationId,
        new Date(Date.now() - 366 * 24 * 60 * 60 * 1000),
      );
      console.log(plan.map((row) => row["QUERY PLAN"]).join("\n"));
    }
    for (const [name, ms] of Object.entries(results)) expect(ms, name).toBeLessThanOrEqual(P95_MS);
  }, 1_800_000);
});
