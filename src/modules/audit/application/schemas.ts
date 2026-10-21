import { z } from "zod";
import { isValidDate } from "@/shared/kernel/calendar-date";
import { AUDIT_ACTIONS } from "./entity-types";

// Filters of the audit log viewer (spec F15 section 5), shared by the page URL, the search and the
// export. Messages are catalog keys (audit.validation.*, ADR-028). Empty query values count as absent.
const blankToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);
const optional = <S extends z.ZodType>(schema: S) => z.preprocess(blankToUndefined, schema.optional());

const calendarDate = z.string().refine(isValidDate, "audit.validation.invalidDate");

export const auditFiltersSchema = z.object({
  from: optional(calendarDate),
  to: optional(calendarDate),
  user: z.preprocess(
    blankToUndefined,
    z
      .union([z.literal("ALL"), z.literal("SYSTEM"), z.uuid("audit.validation.invalidUser")], {
        error: "audit.validation.invalidUser",
      })
      .default("ALL"),
  ),
  action: z.preprocess(
    blankToUndefined,
    z.enum(["ALL", ...AUDIT_ACTIONS], "audit.validation.invalidAction").default("ALL"),
  ),
  entityType: z.preprocess(
    blankToUndefined,
    z
      .union([z.literal("ALL"), z.string().regex(/^[a-z_]{1,40}$/, "audit.validation.invalidEntityType")], {
        error: "audit.validation.invalidEntityType",
      })
      .default("ALL"),
  ),
  // Checked after the entity type requirement, so an id without a type reads that message first.
  entityId: optional(z.string().max(100, "audit.validation.invalidId")),
  cursor: optional(z.string().max(200, "audit.validation.invalidCursor")),
});

export type AuditFiltersInput = z.infer<typeof auditFiltersSchema>;

export const entityIdSchema = z.uuid("audit.validation.invalidId");

// The filters as they are recorded in the export event and echoed to the client.
export type AuditFilters = {
  from: string;
  to: string;
  user: string;
  action: string;
  entityType: string;
  entityId?: string;
};
