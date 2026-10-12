import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { agingBucket } from "@/modules/analytics";
import { db } from "@/shared/db/client";
import { createTranslator } from "@/shared/i18n/translator";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import {
  addDays,
  billingWorld,
  controlledDataset,
  custom,
  day,
  freshReports,
  insertAppointment,
  insertCharge,
  localInstant,
  readBody,
  textOf,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

const LISBON = "Europe/Lisbon";
const t = createTranslator("pt-BR");

async function report(id: string, input: Record<string, unknown>, ctx = world.manager) {
  const result = await freshReports().api.getReport(ctx, id, input);
  if (!result.ok)
    throw new Error(`getReport failed: ${result.error.code} ${JSON.stringify(result.error.fields)}`);
  return result.value;
}

describe("report access", () => {
  it("F13: front desk and professional are denied every report use case, and the denial is audited", async () => {
    const { api } = freshReports();
    for (const ctx of [world.desk, world.pro]) {
      for (const id of ["appointments", "cancellations", "revenue", "receivables", "productivity"]) {
        const result = await api.getReport(ctx, id, { period: "TODAY" });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("AUTHZ_FORBIDDEN");
          expect(result.error.httpStatus).toBe(403);
        }
      }
      for (const format of ["csv", "pdf"] as const) {
        const exported = await api.exportReport(ctx, "appointments", format, { period: "TODAY" });
        expect(exported.ok).toBe(false);
        if (!exported.ok) expect(exported.error.httpStatus).toBe(403);
      }
    }
    const denials = await auditEvents({ action: "PERMISSION_DENIED" });
    expect(denials.filter((event) => JSON.stringify(event.metadata).includes("report:read")).length).toBe(
      2 * (5 + 2),
    );
    expect((await api.getReport(world.admin, "appointments", { period: "TODAY" })).ok).toBe(true);
    expect((await api.getReport(world.manager, "appointments", { period: "TODAY" })).ok).toBe(true);
  });
});

describe("report validation", () => {
  it("F13: a period longer than 366 days is rejected by every report and by the export", async () => {
    const { api } = freshReports();
    const input = custom({ from: addDays(day(0), -400), to: day(0) });
    for (const id of ["appointments", "cancellations", "revenue", "receivables", "productivity"]) {
      const result = await api.getReport(world.manager, id, input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ANALYTICS_PERIOD_TOO_LONG");
    }
    const exported = await api.exportReport(world.manager, "revenue", "csv", input);
    expect(exported.ok).toBe(false);
    if (!exported.ok) expect(exported.error.code).toBe("ANALYTICS_PERIOD_TOO_LONG");
    expect(
      (await api.getReport(world.manager, "revenue", custom({ from: addDays(day(0), -365), to: day(0) }))).ok,
    ).toBe(true);
  });

  it("F13: an unknown report, unit, professional, service or reason is rejected", async () => {
    const { api } = freshReports();
    const unknown = "00000000-0000-4000-8000-000000000000";
    const code = async (id: string, extra: Record<string, unknown>) => {
      const result = await api.getReport(world.manager, id, { period: "TODAY", ...extra });
      return result.ok ? "OK" : result.error.code;
    };
    expect(await code("nope", {})).toBe("ANALYTICS_REPORT_NOT_FOUND");
    expect(await code("appointments", { unit: unknown })).toBe("ANALYTICS_UNIT_INVALID");
    expect(await code("appointments", { professional: unknown })).toBe("ANALYTICS_PROFESSIONAL_INVALID");
    expect(await code("appointments", { service: unknown })).toBe("ANALYTICS_SERVICE_INVALID");
    expect(await code("cancellations", { reason: unknown })).toBe("ANALYTICS_REASON_INVALID");
  });

  it("F13: a period ending before it starts is rejected", async () => {
    const { api } = freshReports();
    const result = await api.getReport(world.manager, "appointments", custom({ from: day(5), to: day(1) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ANALYTICS_PERIOD_INVALID");
  });
});

describe("appointments report", () => {
  it("F13: appointments report applies period, unit, professional, service and status filters and totals the listed prices per currency", async () => {
    const period = await controlledDataset(world);
    const all = await report("appointments", custom(period));
    expect(all.totals.rowCount).toBe(9);
    expect(all.rows).toHaveLength(9);
    expect(all.totalsRow.price?.length).toBe(2);
    expect(all.totalsRow.price?.join(" ")).toMatch(/2\.000,00/);
    expect(all.totalsRow.price?.join(" ")).toMatch(/250,00/);

    expect((await report("appointments", custom(period, { status: "COMPLETED" }))).totals.rowCount).toBe(4);
    expect((await report("appointments", custom(period, { unit: world.ptUnitId }))).totals.rowCount).toBe(1);
    expect(
      (await report("appointments", custom(period, { professional: world.professionals.bruno }))).totals
        .rowCount,
    ).toBe(2);
    expect(
      (await report("appointments", custom(period, { service: world.services.retorno }))).totals.rowCount,
    ).toBe(9);
    // A period with no appointments is empty.
    const empty = await report(
      "appointments",
      custom({ from: addDays(period.to, 30), to: addDays(period.to, 31) }),
    );
    expect(empty.totals.rowCount).toBe(0);
    expect(empty.rows).toEqual([]);
  });

  it("F13: totals come from the whole result, not from the page shown", async () => {
    const start = day(60);
    for (let index = 0; index < 55; index += 1) {
      await insertAppointment(world, {
        date: addDays(start, index),
        time: "09:00",
        minutes: 30,
        status: "SCHEDULED",
      });
    }
    const period = { from: start, to: addDays(start, 60) };
    const first = await report("appointments", custom(period));
    const second = await report("appointments", custom(period, { page: 2 }));
    expect(first.rows).toHaveLength(50);
    expect(second.rows).toHaveLength(5);
    expect(first.totals.rowCount).toBe(55);
    expect(second.totals.rowCount).toBe(55);
    expect(first.pageCount).toBe(2);
  });

  it("F13: data of another organization never appears in any report or export", async () => {
    const period = await controlledDataset(world);
    const other = await billingWorld();
    await insertAppointment(other, { date: period.from, time: "08:00", minutes: 60, status: "COMPLETED" });
    await insertCharge(other, {
      createdAt: localInstant(period.from, "12:00"),
      grossMinor: 99_000,
      status: "OPEN",
    });
    const mine = await report("appointments", custom(period));
    expect(mine.totals.rowCount).toBe(9);
    const theirs = await report("appointments", custom(period), other.manager);
    expect(theirs.totals.rowCount).toBe(1);
    const receivables = await report(
      "receivables",
      custom({ from: addDays(day(0), -30), to: day(0) }),
      world.manager,
    );
    expect(receivables.totals.rowCount).toBe(0);
  });
});

describe("cancellations report", () => {
  it("F13: cancellations report lists cancellations and no-shows with origin, reason, lead time and the summaries", async () => {
    const period = await controlledDataset(world);
    const view = await report("cancellations", custom(period));
    expect(view.totals.rowCount).toBe(2);
    expect(view.totals.counts).toMatchObject({ CANCELLED: 1, NO_SHOW: 1 });
    const cancelled = view.rows.find((row) => textOf(row.type) === "Cancelado");
    const noShow = view.rows.find((row) => textOf(row.type) === "Faltou");
    expect(cancelled).toBeDefined();
    expect(textOf(cancelled?.origin)).toBe("Paciente");
    // The cancellation happened at the appointment start, so there is no notice.
    expect(textOf(cancelled?.leadTimeHours)).toBe("0");
    expect(textOf(noShow?.origin)).toBe("—");
    expect(textOf(noShow?.leadTimeHours)).toBe("—");

    const byReason = view.summaries.find((summary) => summary.key === "byReason");
    expect(byReason?.rows).toHaveLength(1);
    expect(textOf(byReason?.rows[0]?.count)).toBe("1");
    const byProfessional = view.summaries.find((summary) => summary.key === "byProfessional");
    expect(byProfessional?.rows).toHaveLength(1);
    expect(textOf(byProfessional?.rows[0]?.cancelled)).toBe("1");
    expect(textOf(byProfessional?.rows[0]?.noShows)).toBe("1");

    const onlyNoShows = await report("cancellations", custom(period, { type: "NO_SHOW" }));
    expect(onlyNoShows.totals.rowCount).toBe(1);
    const fromClinic = await report("cancellations", custom(period, { origin: "CLINIC" }));
    expect(fromClinic.totals.rowCount).toBe(0);
  });

  it("F13: the cancellation note is never exported", async () => {
    const period = await controlledDataset(world);
    await db().appointment.updateMany({
      where: { organizationId: world.organizationId, status: "CANCELLED" },
      data: { cancellationNote: "SEGREDO-CLINICO-123" },
    });
    const { api } = freshReports();
    const exported = await api.exportReport(world.manager, "cancellations", "csv", custom(period));
    if (!exported.ok) throw new Error(exported.error.code);
    const csv = await readBody(exported.value.body);
    expect(csv).not.toContain("SEGREDO-CLINICO-123");
    expect(csv).toContain("Paciente");
  });
});

describe("revenue report", () => {
  it("F13: revenue report lists payments and refunds with subtotals for each grouping", async () => {
    const period = await controlledDataset(world);
    const view = await report("revenue", custom(period));
    // Four payments and one refund in the SP unit, one payment in Lisbon.
    expect(view.totals.rowCount).toBe(6);
    expect(view.totals.counts).toMatchObject({ PAYMENT: 5, REFUND: 1 });
    const net = view.totalsRow.amount ?? [];
    expect(net).toHaveLength(2);
    expect(net.join(" ")).toMatch(/420,00/);
    expect(net.join(" ")).toMatch(/80,00/);
    const refund = view.rows.find((row) => textOf(row.type) === "Estorno");
    expect(textOf(refund?.amount)).toMatch(/-.*20,00/);

    const byMethod = view.summaries[0];
    expect(byMethod?.rows.map((row) => textOf(row.group))).toEqual(["Pix", "Pix"]);
    const byUnit = await report("revenue", custom(period, { groupBy: "UNIT" }));
    expect(byUnit.summaries[0]?.rows).toHaveLength(2);
    const byProfessional = await report("revenue", custom(period, { groupBy: "PROFESSIONAL" }));
    // Ana, Bruno, and the manual sale without a professional.
    expect(byProfessional.summaries[0]?.rows.map((row) => textOf(row.group))).toContain("Sem profissional");
    const byService = await report("revenue", custom(period, { groupBy: "SERVICE" }));
    expect(byService.summaries[0]?.rows.length).toBeGreaterThan(0);
  });

  it("F13: revenue filtered by professional uses the charge's professional and leaves charges without a professional out", async () => {
    const period = await controlledDataset(world);
    const ana = await report("revenue", custom(period, { professional: world.professionals.ana }));
    // Ana: 25,000 and 10,000 payments.
    expect(ana.totals.rowCount).toBe(2);
    expect(ana.totalsRow.amount?.join(" ")).toMatch(/350,00/);
  });

  it("F13: records are assigned to the period by their unit's local date", async () => {
    const date = "2026-07-15";
    await insertCharge(world, {
      createdAt: localInstant(date, "00:10", LISBON),
      grossMinor: 8_000,
      status: "PAID",
      unitId: world.ptUnitId,
      currency: "EUR",
      payments: [{ amountMinor: 8_000, at: localInstant(date, "00:30", LISBON) }],
    });
    // 00:30 in Lisbon (summer time) is 23:30 UTC of the day before.
    const inLocalDay = await report("revenue", custom({ from: date, to: date }, { unit: world.ptUnitId }));
    expect(inLocalDay.totals.rowCount).toBe(1);
    const dayBefore = await report(
      "revenue",
      custom({ from: addDays(date, -1), to: addDays(date, -1) }, { unit: world.ptUnitId }),
    );
    expect(dayBefore.totals.rowCount).toBe(0);
  });
});

describe("receivables report", () => {
  it("F13: receivables aging buckets classify charges by days open", async () => {
    const today = dateInTimeZone(new Date(), "America/Sao_Paulo");
    const ages = [0, 30, 31, 60, 61, 90, 91];
    for (const age of ages) {
      await insertCharge(world, {
        createdAt: localInstant(addDays(today, -age), "12:00"),
        grossMinor: 10_000,
        status: "OPEN",
      });
    }
    // Paid and cancelled charges are not receivables.
    await insertCharge(world, {
      createdAt: localInstant(addDays(today, -5), "12:00"),
      grossMinor: 10_000,
      status: "PAID",
      payments: [{ amountMinor: 10_000, at: localInstant(addDays(today, -5), "12:05") }],
    });
    await insertCharge(world, {
      createdAt: localInstant(addDays(today, -5), "13:00"),
      grossMinor: 10_000,
      status: "CANCELLED",
    });
    const period = { from: addDays(today, -120), to: today };
    const view = await report("receivables", custom(period));
    expect(view.totals.rowCount).toBe(7);
    // Oldest first.
    expect(view.rows.map((row) => textOf(row.daysOpen))).toEqual(["91", "90", "61", "60", "31", "30", "0"]);
    expect(view.rows.map((row) => textOf(row.bucket))).toEqual(
      [91, 90, 61, 60, 31, 30, 0].map((age) => t(`analytics.reports.values.bucket.${agingBucket(age)}`)),
    );
    expect(view.totals.counts).toMatchObject({ D0_30: 2, D31_60: 2, D61_90: 2, D90_PLUS: 1 });
    expect(view.totalsRow.balance?.join(" ")).toMatch(/700,00/);

    const oldest = await report("receivables", custom(period, { bucket: "D90_PLUS" }));
    expect(oldest.totals.rowCount).toBe(1);
    const middle = await report("receivables", custom(period, { bucket: "D31_60" }));
    expect(middle.rows.map((row) => textOf(row.daysOpen))).toEqual(["60", "31"]);
  });

  it("F13: a partly paid charge lists its open balance", async () => {
    const today = dateInTimeZone(new Date(), "America/Sao_Paulo");
    await insertCharge(world, {
      createdAt: localInstant(addDays(today, -2), "12:00"),
      grossMinor: 25_000,
      status: "PARTIALLY_PAID",
      payments: [{ amountMinor: 10_000, at: localInstant(addDays(today, -2), "12:05") }],
    });
    const view = await report("receivables", custom({ from: addDays(today, -10), to: today }));
    expect(textOf(view.rows[0]?.amount)).toMatch(/250,00/);
    expect(textOf(view.rows[0]?.balance)).toMatch(/150,00/);
  });
});

describe("productivity report", () => {
  it("F13: productivity report computes completed, no-shows, cancellations, hours, billed, received and ticket per professional and currency", async () => {
    const period = await controlledDataset(world);
    const view = await report("productivity", custom(period));
    expect(view.totals.rowCount).toBe(3);
    const rows = view.rows.map((row) => ({
      name: textOf(row.professional),
      completed: textOf(row.completed),
      noShows: textOf(row.noShows),
      cancelled: textOf(row.cancelled),
      hours: textOf(row.hoursAttended),
      billed: textOf(row.billed),
      received: textOf(row.received),
      ticket: textOf(row.averageTicket),
    }));
    const ana = rows.find((row) => /Ana/.test(row.name));
    expect(ana).toMatchObject({ completed: "2", noShows: "1", cancelled: "1", hours: "2,0" });
    expect(ana?.billed).toMatch(/450,00/);
    expect(ana?.received).toMatch(/350,00/);
    expect(ana?.ticket).toMatch(/175,00/);
    const bruno = rows.filter((row) => /Bruno/.test(row.name));
    expect(bruno).toHaveLength(2);
    const brunoBrl = bruno.find((row) => row.billed.startsWith("R$"));
    expect(brunoBrl).toMatchObject({ completed: "1", hours: "0,8" });
    expect(brunoBrl?.ticket).toMatch(/40,00/);
    const brunoEur = bruno.find((row) => row.billed.includes("€"));
    expect(brunoEur).toMatchObject({ completed: "1", hours: "1,0" });
    expect(brunoEur?.ticket).toMatch(/80,00/);
  });

  it("F13: report totals match the F12 dashboard for the same professional and period", async () => {
    const period = await controlledDataset(world);
    const { api } = freshReports();
    const dash = await api.getDashboard(
      world.manager,
      custom(period, { professional: world.professionals.ana }),
    );
    if (!dash.ok) throw new Error(dash.error.code);
    const view = await report("productivity", custom(period, { professional: world.professionals.ana }));
    expect(view.rows).toHaveLength(1);
    expect(textOf(view.rows[0]?.completed)).toBe(String(dash.value.operations.completed.value));
    const received = dash.value.finance.received.lines.find((line) => line.currency === "BRL");
    expect(Number(received?.amountMinor)).toBe(35_000);
    expect(textOf(view.rows[0]?.received)).toMatch(/350,00/);
  });
});
