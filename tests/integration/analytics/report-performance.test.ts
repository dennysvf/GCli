import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/shared/db/client";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  addDays,
  billingWorld,
  custom,
  day,
  freshReports,
  localInstant,
  readBody,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

// 50,001 appointments, one every 10 minutes, span about 347 days.
const DAYS = 360;

// `count` appointments over DAYS days of the SP unit, each at its own instant, so ordering by start
// is unambiguous (PRD F13 limits: 50,000 CSV rows, 5,000 PDF rows).
async function seed(world: BillingWorld, from: string, count: number) {
  const base = localInstant(from, "00:00");
  await db().$executeRaw`
    INSERT INTO appointment (id, organization_id, unit_id, professional_id, service_id, patient_id, starts_at, ends_at,
                             duration_minutes, price_minor, currency, status, is_overbooking)
    SELECT gen_random_uuid(), ${world.organizationId}::uuid, ${world.unitId}::uuid, ${world.professionals.ana}::uuid,
           ${world.services.retorno}::uuid, ${world.patients.maria}::uuid,
           s.starts_at, s.starts_at + interval '5 minutes', 5, 12000, 'BRL', 'COMPLETED', true
    FROM generate_series(1, ${count}) AS g,
         LATERAL (SELECT ${base}::timestamptz + (g * interval '10 minutes') AS starts_at) s`;
  await db().$executeRaw`ANALYZE`;
}

describe("report export limits and speed", () => {
  it("F13: CSV of 50,000 rows is generated within 10 seconds and every row appears exactly once", async () => {
    const world = await billingWorld();
    const from = day(10);
    await seed(world, from, 50_000);
    const period = { from, to: addDays(from, DAYS) };

    const started = performance.now();
    const exported = await freshReports().api.exportReport(
      world.manager,
      "appointments",
      "csv",
      custom(period),
    );
    if (!exported.ok) throw new Error(exported.error.code);
    const text = await readBody(exported.value.body);
    const elapsed = performance.now() - started;

    const lines = text.slice(1).trim().split("\r\n");
    expect(lines.length - 1).toBe(50_000);
    expect(exported.value.rowCount).toBe(50_000);
    expect(elapsed, `took ${Math.round(elapsed)} ms`).toBeLessThan(10_000);
    // Rows come in start order across the 25 batches, and none repeats.
    const keys = lines.slice(1).map((line) => {
      const [date = "", time = ""] = line.split(";");
      const [dd, mm, yyyy] = date.split("/");
      return `${yyyy}${mm}${dd}${time}`;
    });
    expect(new Set(keys).size).toBe(50_000);
    expect(keys).toEqual([...keys].sort());
  }, 120_000);

  it("F13: CSV above 50,000 rows is refused before streaming", async () => {
    const world = await billingWorld();
    const from = day(10);
    await seed(world, from, 50_001);
    const period = { from, to: addDays(from, DAYS) };
    const exported = await freshReports().api.exportReport(
      world.manager,
      "appointments",
      "csv",
      custom(period),
    );
    expect(exported.ok).toBe(false);
    if (!exported.ok) {
      expect(exported.error.code).toBe("ANALYTICS_EXPORT_TOO_LARGE");
      expect(exported.error.params).toEqual({ count: 50_001 });
    }
  }, 120_000);

  it("F13: PDF above 5,000 rows is refused with the advice to export CSV", async () => {
    const world = await billingWorld();
    const from = day(10);
    await seed(world, from, 5_001);
    const period = { from, to: addDays(from, DAYS) };
    const { api, documents } = freshReports();
    const pdf = await api.exportReport(world.manager, "appointments", "pdf", custom(period));
    expect(pdf.ok).toBe(false);
    if (!pdf.ok) {
      expect(pdf.error.code).toBe("ANALYTICS_PDF_TOO_LARGE");
      expect(pdf.error.params).toEqual({ count: 5_001 });
    }
    expect(documents).toHaveLength(0);
    // The same result is still exportable as CSV.
    const csv = await api.exportReport(world.manager, "appointments", "csv", custom(period));
    expect(csv.ok).toBe(true);
    if (csv.ok) await readBody(csv.value.body);
  }, 120_000);
});
