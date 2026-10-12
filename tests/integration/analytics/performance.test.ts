import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAnalytics, type DashboardFigures, type TtlCache } from "@/modules/analytics";
import { db } from "@/shared/db/client";
import { closeHelpers, resetDatabase } from "../helpers";
import { firstReasonId } from "../scheduling/support";
import { addDays, billingWorld, custom, day, localInstant, type BillingWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

const APPOINTMENTS = 15_000;
const DAYS = 30;
const RUNS = 20;

// Every run computes from the database (ADR-037: the cache would hide the cost).
const noCache: TtlCache<DashboardFigures> = {
  get: () => undefined,
  set: () => undefined,
  clear: () => undefined,
};

// ~15,000 appointments in 30 days over both units, each with a paid charge (PRD F12 target).
async function seed(world: BillingWorld, from: string) {
  const base = localInstant(from, "08:00");
  const reasonId = await firstReasonId(world.manager);
  await db().$executeRaw`
    INSERT INTO appointment (id, organization_id, unit_id, professional_id, service_id, patient_id, starts_at, ends_at,
                             duration_minutes, price_minor, currency, status, is_overbooking,
                             cancellation_origin, cancellation_reason_id, cancelled_at)
    SELECT gen_random_uuid(), ${world.organizationId}::uuid,
           CASE WHEN g % 5 = 0 THEN ${world.ptUnitId}::uuid ELSE ${world.unitId}::uuid END,
           CASE WHEN g % 2 = 0 THEN ${world.professionals.ana}::uuid ELSE ${world.professionals.bruno}::uuid END,
           ${world.services.retorno}::uuid, ${world.patients.maria}::uuid,
           s.starts_at, s.starts_at + interval '30 minutes', 30, 12000,
           CASE WHEN g % 5 = 0 THEN 'EUR' ELSE 'BRL' END,
           CASE WHEN g % 10 = 1 THEN 'CANCELLED' WHEN g % 10 = 2 THEN 'NO_SHOW' WHEN g % 10 < 7 THEN 'COMPLETED' ELSE 'SCHEDULED' END,
           true,
           CASE WHEN g % 10 = 1 THEN 'PATIENT' END,
           CASE WHEN g % 10 = 1 THEN ${reasonId}::uuid END,
           CASE WHEN g % 10 = 1 THEN s.starts_at END
    FROM generate_series(1, ${APPOINTMENTS}) AS g,
         LATERAL (SELECT ${base}::timestamptz + ((g % ${DAYS}) * interval '1 day') + (((g / ${DAYS}) % 120) * interval '5 minutes') AS starts_at) s`;
  await db().$executeRaw`
    WITH source AS (
      SELECT a.id AS appointment_id, a.unit_id, a.professional_id, a.currency, a.starts_at, gen_random_uuid() AS charge_id,
             gen_random_uuid() AS submission_id, row_number() OVER () AS n
      FROM appointment a
      WHERE a.organization_id = ${world.organizationId}::uuid AND a.status <> 'CANCELLED'
    ), charges AS (
      INSERT INTO charge (id, organization_id, number, patient_id, origin, description, professional_id, unit_id, currency,
                          gross_minor, net_minor, paid_minor, status, created_by_id, created_at)
      SELECT charge_id, ${world.organizationId}::uuid, 'P-' || n, ${world.patients.maria}::uuid, 'MANUAL', 'Carga',
             professional_id, unit_id, currency, 12000, 12000, 12000, 'PAID', ${world.desk.user.id}::uuid, starts_at
      FROM source
      RETURNING id
    ), submissions AS (
      INSERT INTO payment_submission (organization_id, id, charge_id, user_id)
      SELECT ${world.organizationId}::uuid, submission_id, charge_id, ${world.desk.user.id}::uuid FROM source
      WHERE charge_id IN (SELECT id FROM charges)
      RETURNING id
    )
    INSERT INTO payment (id, organization_id, charge_id, kind, submission_id, method, amount_minor, currency, unit_id,
                         received_at, user_id)
    SELECT gen_random_uuid(), ${world.organizationId}::uuid, charge_id, 'PAYMENT', submission_id, 'PIX', 12000, currency,
           unit_id, starts_at + interval '30 minutes', ${world.desk.user.id}::uuid
    FROM source WHERE submission_id IN (SELECT id FROM submissions)`;
  await db().$executeRaw`ANALYZE`;
}

describe("dashboard performance", () => {
  it("F12: dashboard computes 30 days of all units with 15,000 appointments within 3 seconds at p95", async () => {
    const world = await billingWorld();
    const from = day(5);
    const period = { from, to: addDays(from, DAYS - 1) };
    await seed(world, from);
    const api = createAnalytics((base) => ({ ...base, cache: noCache }));

    const first = await api.getDashboard(world.manager, custom(period));
    if (!first.ok) throw new Error(first.error.code);
    expect(first.value.operations.appointments.value).toBe(APPOINTMENTS - APPOINTMENTS / 10);

    const timings: number[] = [];
    for (let run = 0; run < RUNS; run++) {
      const started = performance.now();
      const result = await api.getDashboard(world.manager, custom(period));
      timings.push(performance.now() - started);
      expect(result.ok).toBe(true);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.ceil(RUNS * 0.95) - 1] ?? Infinity;
    console.info(
      `F12 dashboard p95: ${Math.round(p95)} ms (median ${Math.round(timings[RUNS / 2] ?? 0)} ms)`,
    );
    expect(p95).toBeLessThanOrEqual(3_000);
  }, 600_000);
});
