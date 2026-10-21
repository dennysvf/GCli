import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { professionals } from "@/modules/professionals";
import { scheduling } from "@/modules/scheduling";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { db } from "@/shared/db/client";
import { isoWeekday } from "@/shared/kernel/calendar-date";
import { closeHelpers, resetDatabase } from "../helpers";
import { h, orgDate, professionalInput, registration } from "../professionals/support";
import { fullWeek } from "../units/support";
import { bookOrThrow, schedulingWorld, type World } from "./support";

// PRD F16 criterion 9 (ADR-019, ADR-030): a 09:00 working interval and a 09:00 appointment stay
// at 09:00 local on both sides of a daylight-saving change in Madrid, Santiago and New York.
// The transitions are found from the time-zone database at run time (the next two after today),
// so the test always crosses a real change of the coming year in both directions.

beforeEach(resetDatabase);
afterAll(closeHelpers);

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

type ZoneCase = {
  timeZone: string;
  country: "ES" | "CL" | "US";
  currency: "EUR" | "CLP" | "USD";
  // UTC offsets in minutes: standard time, then daylight-saving time.
  offsets: [number, number];
  registration: Record<string, unknown>;
};

const CASES: ZoneCase[] = [
  {
    timeZone: "Europe/Madrid",
    country: "ES",
    currency: "EUR",
    offsets: [60, 120],
    registration: { country: "ES", councilType: "COLEGIO_MEDICOS", number: "282812345", region: "M" },
  },
  {
    timeZone: "America/Santiago",
    country: "CL",
    currency: "CLP",
    offsets: [-240, -180],
    registration: { country: "CL", councilType: "SIS", number: "123456", region: null },
  },
  {
    timeZone: "America/New_York",
    country: "US",
    currency: "USD",
    offsets: [-300, -240],
    registration: { country: "US", councilType: "STATE_LICENSE", number: "209876", region: "NY" },
  },
];

// The zone's offset read from the platform time-zone database, independent of the app's helpers.
function offsetAt(timeZone: string, instant: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function localDate(timeZone: string, instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function localClock(timeZone: string, instant: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

// The next `count` instants after `from` at which the zone's offset changes, to the minute.
function nextTransitions(timeZone: string, from: Date, count: number): Date[] {
  const found: Date[] = [];
  let cursor = from.getTime();
  let offset = offsetAt(timeZone, from);
  for (let step = 0; step < 800 && found.length < count; step += 1) {
    const next = cursor + DAY_MS;
    const nextOffset = offsetAt(timeZone, new Date(next));
    if (nextOffset !== offset) {
      let low = cursor;
      let high = next;
      while (high - low > MINUTE_MS) {
        const middle = Math.floor((low + high) / 2);
        if (offsetAt(timeZone, new Date(middle)) === offset) low = middle;
        else high = middle;
      }
      found.push(new Date(high));
      offset = nextOffset;
    }
    cursor = next;
  }
  return found;
}

// 09:00 on a local date as an instant, for a known offset of that day.
const nineAt = (date: string, offsetMinutes: number) =>
  new Date(Date.parse(`${date}T09:00:00Z`) - offsetMinutes * MINUTE_MS);

const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;

// A unit of the country open every day 07:00–21:00, a 30-minute service priced in its currency,
// and a professional registered in that country working 09:00–10:00 every day of the week there.
async function zoneClinic(world: World, zone: ZoneCase) {
  const unit = await units.createUnit(world.admin, {
    name: `Unidade ${zone.timeZone}`,
    country: zone.country,
    timeZone: zone.timeZone,
    phone: null,
    email: null,
    address: {},
  });
  if (!unit.ok) throw new Error(`createUnit failed: ${unit.error.code}`);
  const unitId = unit.value.unitId;
  const hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    intervals: [{ start: h(7), end: h(21) }],
  }));
  const opened = await units.replaceBusinessHours(world.admin, { unitId, days: fullWeek(hours) });
  if (!opened.ok) throw new Error(`replaceBusinessHours failed: ${opened.error.code}`);

  const categories = await services.listCategories(world.admin);
  const categoryId = categories.ok ? categories.value[0]?.id : undefined;
  if (!categoryId) throw new Error("no category");
  const service = await services.createService(world.admin, {
    name: "Consulta internacional",
    categoryId,
    description: null,
    durationMinutes: 30,
    prices: [
      { currency: "BRL", amountMinor: 25_000 },
      { currency: zone.currency, amountMinor: 9_000 },
    ],
    color: "blue",
    requiresRoom: false,
    allowedRoomIds: [],
  });
  if (!service.ok) throw new Error(`createService failed: ${service.error.code}`);
  const serviceId = service.value.serviceId;

  const created = await professionals.createProfessional(
    world.admin,
    professionalInput({
      fullName: "Carmen Ortega Ruiz",
      displayName: "Dra. Carmen",
      registrations: [registration(zone.registration)],
      email: null,
    }),
  );
  if (!created.ok) throw new Error(`createProfessional failed: ${created.error.code}`);
  const professionalId = created.value.professionalId;
  const enabled = await professionals.replaceEnabledServices(world.admin, {
    professionalId,
    version: 1,
    serviceIds: [serviceId],
  });
  if (!enabled.ok) throw new Error(`replaceEnabledServices failed: ${enabled.error.code}`);
  const schedule = await professionals.saveSchedule(world.admin, {
    professionalId,
    validFrom: orgDate(),
    intervals: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ unitId, weekday, start: h(9), end: h(10) })),
  });
  if (!schedule.ok) throw new Error(`saveSchedule failed: ${schedule.error.code}`);
  return { unitId, serviceId, professionalId };
}

let world: World;
beforeEach(async () => {
  world = await schedulingWorld();
});

describe("daylight-saving changes", () => {
  for (const zone of CASES) {
    it(`F16: in ${zone.timeZone} a 09:00 working interval and 09:00 appointments stay at 09:00 local across the next two clock changes`, async () => {
      const clinic = await zoneClinic(world, zone);
      // Four days ahead keeps "two days before the change" in the future for the booking rules.
      const transitions = nextTransitions(zone.timeZone, new Date(Date.now() + 4 * DAY_MS), 2);
      expect(transitions).toHaveLength(2);

      // The working interval is stored once per weekday as wall-clock minutes, never as an instant.
      const intervals = await db().professionalWorkingInterval.findMany({
        where: { unitId: clinic.unitId },
      });
      expect(intervals).toHaveLength(7);
      for (const row of intervals) expect([row.startMinute, row.endMinute]).toEqual([h(9), h(10)]);

      for (const change of transitions) {
        const offsetBefore = offsetAt(zone.timeZone, new Date(change.getTime() - HOUR_MS));
        const offsetAfter = offsetAt(zone.timeZone, change);
        // A real daylight-saving change of this zone: standard and summer time, one hour apart.
        expect([offsetBefore, offsetAfter].sort((a, b) => a - b)).toEqual(zone.offsets);

        const before = localDate(zone.timeZone, new Date(change.getTime() - 2 * DAY_MS));
        // The day of the change: every zone here changes in the night, so 09:00 is already after it.
        const changeDay = localDate(zone.timeZone, new Date(change.getTime() + 3 * HOUR_MS));
        const after = localDate(zone.timeZone, new Date(change.getTime() + 2 * DAY_MS));
        const days = [
          { date: before, offset: offsetBefore },
          { date: changeDay, offset: offsetAfter },
          { date: after, offset: offsetAfter },
        ];
        expect(nineAt(changeDay, offsetAfter).getTime()).toBeGreaterThan(change.getTime());

        // The F04 working calendar shows 09:00–10:00 on each side of the change.
        const calendar = await professionals.getWorkingCalendar(world.admin, clinic.professionalId, {
          from: before,
          to: after,
        });
        if (!calendar.ok) throw new Error(`getWorkingCalendar failed: ${calendar.error.code}`);
        for (const { date } of days) {
          const entry = calendar.value.days
            .find((item) => item.date === date)
            ?.units.find((item) => item.unitId === clinic.unitId);
          expect(entry).toMatchObject({ timeZone: zone.timeZone, intervals: [{ start: h(9), end: h(10) }] });
        }

        const slot = { ...clinic, roomId: null, patientId: world.patients.maria };
        const findingsAt = async (date: string, startTime: string) => {
          const preview = await scheduling.previewConflicts(world.desk, { ...slot, date, startTime });
          if (!preview.ok) throw new Error(`previewConflicts failed: ${preview.error.code}`);
          return preview.value.findings.map((finding) => finding.code);
        };

        const booked: Date[] = [];
        for (const { date, offset } of days) {
          // The interval opens at 09:00 and closes at 10:00 local, not an hour off on either side.
          expect(await findingsAt(date, "08:30")).toContain("SCHEDULING_OUTSIDE_WORKING_HOURS");
          expect(await findingsAt(date, "09:00")).not.toContain("SCHEDULING_OUTSIDE_WORKING_HOURS");
          expect(await findingsAt(date, "09:30")).not.toContain("SCHEDULING_OUTSIDE_WORKING_HOURS");
          expect(await findingsAt(date, "10:00")).toContain("SCHEDULING_OUTSIDE_WORKING_HOURS");

          // The front desk cannot override availability: booking works only inside the interval.
          const result = await bookOrThrow(world.desk, { ...slot, date, startTime: "09:00", notes: null });
          expect(result.warnings.map((warning) => warning.code)).not.toContain(
            "SCHEDULING_OUTSIDE_WORKING_HOURS",
          );
          const row = await db().appointment.findUniqueOrThrow({ where: { id: result.appointmentId } });
          expect(localDate(zone.timeZone, row.startsAt)).toBe(date);
          expect(localClock(zone.timeZone, row.startsAt)).toBe("09:00");
          expect(row.startsAt.toISOString()).toBe(nineAt(date, offset).toISOString());
          expect(result.startsAt).toBe(row.startsAt.toISOString());
          booked.push(row.startsAt);
        }

        // Same wall clock, different instant: across the change the UTC time moves by the offset
        // difference (an hour earlier in UTC when the clocks go forward, later when they go back).
        const [first, , last] = booked;
        if (!first || !last) throw new Error("missing bookings");
        const elapsed = last.getTime() - first.getTime();
        expect(elapsed - daysBetween(before, after) * DAY_MS).toBe(-(offsetAfter - offsetBefore) * MINUTE_MS);
        expect(first.getUTCHours()).not.toBe(last.getUTCHours());

        // A weekly series booked before the change keeps 09:30 local after it.
        const series = await scheduling.bookSeries(world.desk, {
          ...slot,
          patientId: world.patients.joao,
          date: before,
          startTime: "09:30",
          notes: null,
          recurrence: {
            frequency: "WEEKLY",
            weekdays: [isoWeekday(before)],
            endsAfter: 3,
            endsOn: null,
          },
        });
        if (!series.ok) throw new Error(`bookSeries failed: ${series.error.code}`);
        expect(series.value.appointmentIds).toHaveLength(3);
        const occurrences = await db().appointment.findMany({
          where: { id: { in: series.value.appointmentIds } },
          orderBy: { startsAt: "asc" },
        });
        const expectedDates = [0, 7, 14].map((offsetDays) =>
          new Date(Date.parse(`${before}T00:00:00Z`) + offsetDays * DAY_MS).toISOString().slice(0, 10),
        );
        expect(occurrences.map((row) => localDate(zone.timeZone, row.startsAt))).toEqual(expectedDates);
        expect(occurrences.map((row) => localClock(zone.timeZone, row.startsAt))).toEqual([
          "09:30",
          "09:30",
          "09:30",
        ]);
        const [firstOccurrence, secondOccurrence] = occurrences;
        if (!firstOccurrence || !secondOccurrence) throw new Error("missing occurrences");
        expect(secondOccurrence.startsAt.getTime() - firstOccurrence.startsAt.getTime()).toBe(
          7 * DAY_MS - (offsetAfter - offsetBefore) * MINUTE_MS,
        );
      }
    });
  }
});
