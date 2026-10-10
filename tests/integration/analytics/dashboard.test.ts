import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { analytics, type DashboardView } from "@/modules/analytics";
import { cash } from "@/modules/cash";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import {
  addDays,
  amounts,
  billingWorld,
  controlledDataset,
  custom,
  day,
  freshAnalytics,
  insertAppointment,
  insertCharge,
  localInstant,
  setPatientCreatedAt,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

async function dashboard(input: Record<string, unknown>, ctx = world.manager): Promise<DashboardView> {
  const result = await freshAnalytics().getDashboard(ctx, input);
  if (!result.ok)
    throw new Error(`getDashboard failed: ${result.error.code} ${JSON.stringify(result.error.fields)}`);
  return result.value;
}

describe("dashboard access", () => {
  it("F12: front desk and professional are denied the dashboard and the denial is audited", async () => {
    for (const ctx of [world.desk, world.pro]) {
      const result = await analytics.getDashboard(ctx, { period: "TODAY" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("AUTHZ_FORBIDDEN");
    }
    const denials = await auditEvents({ action: "PERMISSION_DENIED" });
    expect(denials.filter((event) => JSON.stringify(event.metadata).includes("dashboard:read"))).toHaveLength(
      2,
    );
    expect((await analytics.getDashboard(world.admin, { period: "TODAY" })).ok).toBe(true);
    expect((await analytics.getDashboard(world.manager, { period: "TODAY" })).ok).toBe(true);
  });
});

describe("dashboard KPIs", () => {
  it("F12: KPIs match the formulas for a controlled dataset", async () => {
    const period = await controlledDataset(world);
    const view = await dashboard(custom(period));

    expect(view.period).toEqual(period);
    expect(view.isEmpty).toBe(false);
    expect(view.professionalSelected).toBe(false);
    // 9 booked, 1 cancelled; completed: 2 (Ana) + 1 (Bruno) + 1 (Lisbon).
    expect(view.operations.appointments.value).toBe(8);
    expect(view.operations.completed.value).toBe(4);
    expect(view.operations.cancellationRate).toMatchObject({ numerator: 1, denominator: 9 });
    expect(view.operations.noShowRate).toMatchObject({ numerator: 1, denominator: 5, value: 0.2 });
    // Booked: Ana 60 + 60 + 60 + 90 (Encaixe union) + 30 (inside hours) = 300; Bruno 50.
    // Available: 7 days × 600 min × 2 − closure (1,200) − Ana's time-off (240) = 6,960.
    expect(view.operations.occupancy).toMatchObject({ numerator: 350, denominator: 6_960 });
    expect(view.operations.newPatients.value).toBe(1);

    expect(amounts(view.finance.billed)).toEqual({ BRL: 62_000, EUR: 8_000 });
    expect(amounts(view.finance.receivable)).toEqual({ BRL: 24_000, EUR: 0 });
    // 25,000 + 10,000 + 5,000 − 2,000 (refund) + 4,000 (older charge paid in P).
    expect(amounts(view.finance.received)).toEqual({ BRL: 42_000, EUR: 8_000 });
    expect(amounts(view.finance.averageTicket)).toEqual({ BRL: 14_000, EUR: 8_000 });
    // Expenses: 30,000 + 1,000 (Geral) + 300 (cash out); revenues: 5,000 + 700 (cash in).
    expect(amounts(view.finance.paidExpenses)).toEqual({ BRL: 31_300 });
    expect(amounts(view.finance.result)).toEqual({ BRL: 42_000 + 5_700 - 31_300, EUR: 8_000 });
  });

  it("F12: unit filter restricts every KPI to the unit", async () => {
    const period = await controlledDataset(world);
    const view = await dashboard(custom(period, { unit: world.unitId }));
    expect(view.operations.appointments.value).toBe(7);
    expect(view.operations.completed.value).toBe(3);
    expect(view.operations.occupancy).toMatchObject({ numerator: 350, denominator: 6_960 });
    expect(view.operations.newPatients.value).toBe(1);
    expect(amounts(view.finance.billed)).toEqual({ BRL: 62_000 });
    expect(amounts(view.finance.received)).toEqual({ BRL: 42_000 });
    // "Geral" entries count only with all units.
    expect(amounts(view.finance.paidExpenses)).toEqual({ BRL: 30_300 });
    expect(amounts(view.finance.result)).toEqual({ BRL: 17_400 });

    const lisbon = await dashboard(custom(period, { unit: world.ptUnitId }));
    expect(lisbon.operations.appointments.value).toBe(1);
    expect(lisbon.operations.newPatients.value).toBe(0);
    expect(amounts(lisbon.finance.received)).toEqual({ EUR: 8_000 });
    expect(lisbon.operations.occupancy.value).toBeNull();
  });

  it("F12: professional filter restricts every KPI and hides paid expenses and result", async () => {
    const period = await controlledDataset(world);
    const view = await dashboard(custom(period, { professional: world.professionals.ana }));
    expect(view.professionalSelected).toBe(true);
    expect(view.operations.appointments.value).toBe(6);
    expect(view.operations.completed.value).toBe(2);
    expect(view.operations.occupancy).toMatchObject({ numerator: 300, denominator: 3_360 });
    expect(view.operations.newPatients.value).toBe(1);
    expect(amounts(view.finance.billed)).toEqual({ BRL: 45_000 });
    expect(amounts(view.finance.received)).toEqual({ BRL: 35_000 });
    expect(amounts(view.finance.receivable)).toEqual({ BRL: 10_000 });
    expect(amounts(view.finance.averageTicket)).toEqual({ BRL: 17_500 });
    expect(view.finance.paidExpenses).toBeNull();
    expect(view.finance.result).toBeNull();

    const bruno = await dashboard(custom(period, { professional: world.professionals.bruno }));
    expect(bruno.operations.newPatients.value).toBe(0);
  });

  it("F12: comparison with the previous period shows the correct variation", async () => {
    const period = await controlledDataset(world);
    await insertAppointment(world, {
      date: addDays(period.from, -1),
      time: "08:00",
      minutes: 60,
      status: "COMPLETED",
    });
    const view = await dashboard(custom(period));
    expect(view.previousPeriod).toEqual({ from: addDays(period.from, -7), to: addDays(period.from, -1) });
    // Billed 62,000 vs. 10,000 + 4,000.
    const billed = view.finance.billed.lines.find((line) => line.currency === "BRL");
    expect(billed).toMatchObject({
      previousMinor: "14000",
      change: { kind: "PERCENT", value: 343, tone: "GOOD" },
    });
    // Appointments 8 vs. 1; the cancellation rate had no base before (0 booked → null rate).
    expect(view.operations.appointments.change).toMatchObject({
      kind: "PERCENT",
      value: 700,
      significant: true,
    });
    expect(view.operations.cancellationRate.previous).toBe(0);
    expect(view.operations.cancellationRate.change).toMatchObject({
      kind: "POINTS",
      value: 11.1,
      tone: "BAD",
    });
    expect(view.operations.newPatients.change.kind).toBe("NO_BASE");
  });

  it("F12: an empty period is reported as empty", async () => {
    const view = await dashboard(custom({ from: day(200), to: day(206) }));
    expect(view.isEmpty).toBe(true);
    expect(view.operations.appointments.value).toBe(0);
    expect(view.finance.billed.lines).toEqual([]);
  });
});

describe("dashboard validation", () => {
  it("F12: a custom period longer than 366 days is rejected", async () => {
    const result = await analytics.getDashboard(
      world.manager,
      custom({ from: "2025-01-01", to: "2026-01-02" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ANALYTICS_PERIOD_TOO_LONG");
    expect(
      (await analytics.getDashboard(world.manager, custom({ from: "2025-01-01", to: "2026-01-01" }))).ok,
    ).toBe(true);
  });

  it("F12: a period ending before it starts is rejected", async () => {
    const result = await analytics.getDashboard(
      world.manager,
      custom({ from: "2026-02-01", to: "2026-01-31" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ANALYTICS_PERIOD_INVALID");
    const missing = await analytics.getDashboard(world.manager, { period: "CUSTOM" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("VALIDATION_FAILED");
  });

  it("F12: an unknown unit or professional is rejected", async () => {
    const unit = await analytics.getDashboard(world.manager, {
      period: "TODAY",
      unit: "0190a000-0000-7000-8000-000000000000",
    });
    expect(!unit.ok && unit.error.code).toBe("ANALYTICS_UNIT_INVALID");
    const professional = await analytics.getDashboard(world.manager, {
      period: "TODAY",
      professional: "0190a000-0000-7000-8000-000000000000",
    });
    expect(!professional.ok && professional.error.code).toBe("ANALYTICS_PROFESSIONAL_INVALID");
  });
});

describe("dashboard data rules", () => {
  it("F12: data of another organization never appears in the dashboard", async () => {
    const period = await controlledDataset(world);
    const other = await billingWorld();
    await insertAppointment(other, { date: period.from, time: "08:00", minutes: 60, status: "COMPLETED" });
    await insertCharge(other, {
      createdAt: localInstant(period.from, "12:00"),
      grossMinor: 99_000,
      status: "PAID",
      payments: [{ amountMinor: 99_000, at: localInstant(period.from, "12:05") }],
    });
    const view = await dashboard(custom(period));
    expect(view.operations.appointments.value).toBe(8);
    expect(amounts(view.finance.billed)).toEqual({ BRL: 62_000, EUR: 8_000 });
    const theirs = await dashboard(custom(period), other.manager);
    expect(theirs.operations.appointments.value).toBe(1);
    expect(amounts(theirs.finance.billed)).toEqual({ BRL: 99_000 });
  });

  it("F12: records are assigned to the period by their unit's local date", async () => {
    const date = day(30);
    // 23:30 local on the last day belongs to it (02:30 UTC of the next day); 00:30 local of the
    // next day does not.
    await insertCharge(world, {
      createdAt: localInstant(date, "23:30"),
      grossMinor: 1_000,
      status: "PAID",
      payments: [{ amountMinor: 1_000, at: localInstant(date, "23:30") }],
    });
    await insertCharge(world, {
      createdAt: localInstant(addDays(date, 1), "00:30"),
      grossMinor: 2_000,
      status: "PAID",
      payments: [{ amountMinor: 2_000, at: localInstant(addDays(date, 1), "00:30") }],
    });
    const view = await dashboard(custom({ from: date, to: date }, { unit: world.unitId }));
    expect(amounts(view.finance.received)).toEqual({ BRL: 1_000 });
    expect(amounts(view.finance.billed)).toEqual({ BRL: 1_000 });
  });

  it("F12: a second load within 5 minutes returns the cached computedAt", async () => {
    let now = new Date();
    const dashboardApi = freshAnalytics(() => now);
    const period = { from: day(40), to: day(40) };
    const first = await dashboardApi.getDashboard(world.manager, custom(period));
    await insertCharge(world, {
      createdAt: localInstant(period.from, "10:00"),
      grossMinor: 1_000,
      status: "PAID",
      payments: [{ amountMinor: 1_000, at: localInstant(period.from, "10:00") }],
    });
    now = new Date(now.getTime() + 4 * 60_000);
    const second = await dashboardApi.getDashboard(world.manager, custom(period));
    if (!first.ok || !second.ok) throw new Error("dashboard failed");
    expect(second.value.computedAt).toBe(first.value.computedAt);
    expect(second.value.finance.received.lines).toEqual([]);

    now = new Date(now.getTime() + 60_000);
    const third = await dashboardApi.getDashboard(world.manager, custom(period));
    if (!third.ok) throw new Error("dashboard failed");
    expect(third.value.computedAt).not.toBe(first.value.computedAt);
    expect(amounts(third.value.finance.received)).toEqual({ BRL: 1_000 });
  });

  it("F12: refunds reduce received in the period of the refund", async () => {
    const date = day(50);
    await insertCharge(world, {
      createdAt: localInstant(date, "10:00"),
      grossMinor: 10_000,
      status: "PARTIALLY_PAID",
      payments: [
        {
          amountMinor: 10_000,
          at: localInstant(date, "10:00"),
          refund: { amountMinor: 3_000, at: localInstant(addDays(date, 1), "10:00") },
        },
      ],
    });
    const first = await dashboard(custom({ from: date, to: date }));
    const second = await dashboard(custom({ from: addDays(date, 1), to: addDays(date, 1) }));
    expect(amounts(first.finance.received)).toEqual({ BRL: 10_000 });
    expect(amounts(second.finance.received)).toEqual({ BRL: -3_000 });
  });

  it("F12: transfers and reversed movements are excluded from the result", async () => {
    const period = await controlledDataset(world);
    const view = await dashboard(custom({ from: addDays(period.from, 3), to: addDays(period.from, 4) }));
    // Day 4: reversed expense payment; day 5: cash in 700, out 300 (transfer and reversed excluded),
    // refund −2,000 and the sale of 5,000.
    expect(amounts(view.finance.paidExpenses)).toEqual({ BRL: 300 });
    expect(amounts(view.finance.result)).toEqual({ BRL: 5_000 - 2_000 + 700 - 300 });
  });
});

describe("dashboard cross-feature integration", () => {
  it("F12: new patients match the patients created in F05 in the period", async () => {
    const date = day(60);
    await setPatientCreatedAt(world.patients.maria, localInstant(date, "09:00"));
    await setPatientCreatedAt(world.patients.joao, localInstant(date, "23:59"));
    const view = await dashboard(custom({ from: date, to: date }));
    expect(view.operations.newPatients.value).toBe(2);
    const today = await dashboard({ period: "TODAY" });
    expect(today.operations.newPatients.value).toBe(0);
  });

  it("F12: KPIs match the totals from appointments, charges and payments, and expenses", async () => {
    const period = await controlledDataset(world);
    const view = await dashboard(custom(period, { unit: world.unitId }));
    const { db } = await import("@/shared/db/client");
    const where = { organizationId: world.organizationId, unitId: world.unitId };
    const [kept, completed] = await Promise.all([
      db().appointment.count({ where: { ...where, status: { not: "CANCELLED" } } }),
      db().appointment.count({ where: { ...where, status: "COMPLETED" } }),
    ]);
    expect(view.operations.appointments.value).toBe(kept);
    expect(view.operations.completed.value).toBe(completed);
    const charges = await db().charge.findMany({
      where: {
        ...where,
        status: { not: "CANCELLED" },
        createdAt: { gte: localInstant(period.from, "00:00") },
      },
    });
    expect(amounts(view.finance.billed).BRL).toBe(
      charges.reduce((sum, charge) => sum + Number(charge.netMinor), 0),
    );
  });

  it("F12: result matches the F11 statement result for the same unit and period", async () => {
    const period = await controlledDataset(world);
    const view = await dashboard(custom(period, { unit: world.unitId }));
    const statement = await cash.getStatement(world.manager, {
      unit: world.unitId,
      from: period.from,
      to: period.to,
      currency: "BRL",
    });
    if (!statement.ok) throw new Error(statement.error.code);
    expect(amounts(view.finance.result).BRL).toBe(statement.value.resultMinor);
  });

  it("F12: money KPIs are listed per currency and never summed across currencies", async () => {
    const period = await controlledDataset(world);
    const view = await dashboard(custom(period));
    for (const kpi of [view.finance.billed, view.finance.received, view.finance.averageTicket]) {
      expect(kpi.lines.map((line) => line.currency)).toEqual(["BRL", "EUR"]);
    }
  });
});
