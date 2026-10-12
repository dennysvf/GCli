import { z } from "zod";
import { isValidDate } from "@/shared/kernel/calendar-date";
import { PERIOD_PRESETS } from "../domain/period";

// Zod schema of the dashboard filters (spec F12 section 5). Messages are catalog keys
// (analytics.validation.*, ADR-028).
const calendarDate = z.string().refine(isValidDate, "analytics.validation.invalidDate");
const allOrId = z.union([z.literal("ALL"), z.uuid("analytics.validation.invalidId")]);

export const dashboardFiltersSchema = z
  .object({
    period: z.enum(PERIOD_PRESETS, "analytics.validation.invalidPeriod"),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    unit: allOrId.default("ALL"),
    professional: allOrId.default("ALL"),
  })
  .superRefine((value, issue) => {
    if (value.period !== "CUSTOM") return;
    if (!value.from)
      issue.addIssue({ code: "custom", path: ["from"], message: "analytics.validation.dateRequired" });
    if (!value.to)
      issue.addIssue({ code: "custom", path: ["to"], message: "analytics.validation.dateRequired" });
  });

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
