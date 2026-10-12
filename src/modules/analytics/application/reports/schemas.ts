import { z } from "zod";
import { isValidDate } from "@/shared/kernel/calendar-date";
import { PERIOD_PRESETS } from "../../domain/period";
import { AGING_BUCKETS } from "../../domain/limits";
import type { ReportId } from "./types";

// Filters of the reports (spec F13 section 5). Messages are catalog keys (analytics.validation.*).
const calendarDate = z.string().refine(isValidDate, "analytics.validation.invalidDate");
const allOrId = z.union([z.literal("ALL"), z.uuid("analytics.validation.invalidId")]);

const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
] as const;
const CANCELLATION_ORIGINS = ["PATIENT", "CLINIC", "PROFESSIONAL"] as const;
const CHARGE_ORIGINS = ["APPOINTMENT", "PACKAGE", "MANUAL"] as const;

function oneOfOrAll<const T extends readonly string[]>(values: T) {
  return z.enum(["ALL", ...values], "analytics.validation.invalidFilter").default("ALL");
}

export function reportFiltersSchema(report: ReportId) {
  const origins = report === "receivables" ? CHARGE_ORIGINS : CANCELLATION_ORIGINS;
  return z
    .object({
      period: z.enum(PERIOD_PRESETS, "analytics.validation.invalidPeriod"),
      from: calendarDate.optional(),
      to: calendarDate.optional(),
      unit: allOrId.default("ALL"),
      professional: allOrId.default("ALL"),
      page: z.coerce.number().int("analytics.validation.invalidFilter").min(1).default(1),
      service: allOrId.default("ALL"),
      status: oneOfOrAll(APPOINTMENT_STATUSES),
      type: oneOfOrAll(["CANCELLED", "NO_SHOW"] as const),
      origin: oneOfOrAll(origins),
      reason: allOrId.default("ALL"),
      groupBy: z
        .enum(["METHOD", "SERVICE", "PROFESSIONAL", "UNIT"], "analytics.validation.invalidFilter")
        .default("METHOD"),
      method: z.string().max(20).default("ALL"),
      bucket: oneOfOrAll(AGING_BUCKETS.map((bucket) => bucket.id)),
    })
    .superRefine((value, issue) => {
      if (value.period !== "CUSTOM") return;
      if (!value.from)
        issue.addIssue({ code: "custom", path: ["from"], message: "analytics.validation.dateRequired" });
      if (!value.to)
        issue.addIssue({ code: "custom", path: ["to"], message: "analytics.validation.dateRequired" });
    });
}

export type ParsedReportFilters = z.infer<ReturnType<typeof reportFiltersSchema>>;
