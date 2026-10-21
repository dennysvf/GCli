import { addDays, daysBetween } from "@/shared/kernel/calendar-date";
import type { DomainError } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { zonedTimeToUtc } from "@/shared/kernel/zoned-time";
import { AuditErrors } from "./errors";
import { AUDIT_DEFAULT_PERIOD_DAYS, AUDIT_MAX_PERIOD_DAYS } from "./limits";

export type AuditPeriod = {
  from: string;
  to: string;
  // UTC window [windowStart, windowEnd) of the local dates; it bounds the partitions scanned.
  windowStart: Date;
  windowEnd: Date;
};

// Spec F15 decision D4: `from` and `to` are inclusive dates in the organization's time zone (audit
// events have no unit). Without dates, the last 30 days including today.
export function resolveAuditPeriod(
  input: { from?: string | undefined; to?: string | undefined },
  today: string,
  timeZone: string,
  defaultDays: number = AUDIT_DEFAULT_PERIOD_DAYS,
): Result<AuditPeriod, DomainError> {
  const to = input.to ?? today;
  const from = input.from ?? addDays(to, -(defaultDays - 1));
  if (to < from) return fail(AuditErrors.periodInvalid());
  if (daysBetween(from, to) + 1 > AUDIT_MAX_PERIOD_DAYS) return fail(AuditErrors.periodTooLong());
  return ok({
    from,
    to,
    windowStart: zonedTimeToUtc(`${from}T00:00`, timeZone),
    windowEnd: zonedTimeToUtc(`${addDays(to, 1)}T00:00`, timeZone),
  });
}
