import { z } from "zod";
import { isValidDate } from "@/shared/kernel/calendar-date";
import { CANCELLATION_ORIGINS } from "../domain/appointment";
import {
  CANCELLATION_NOTE_MAX,
  DURATION_MAX,
  DURATION_MIN,
  DURATION_STEP,
  JUSTIFICATION_MAX,
  JUSTIFICATION_MIN,
  NOTES_MAX,
  REASON_NAME_MAX,
} from "../domain/limits";
import { SERIES_FREQUENCIES } from "../domain/recurrence";
import { APPOINTMENT_STATUSES } from "../domain/status";

// Zod schemas shared by the booking forms, the routes and the use cases (PRD F06 Capabilities).

const id = z.uuid("scheduling.validation.optionRequired");
const date = z.string().refine(isValidDate, "scheduling.validation.dateInvalid");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "scheduling.validation.timeInvalid");

const duration = z.coerce
  .number()
  .int()
  .min(DURATION_MIN, "scheduling.validation.duration")
  .max(DURATION_MAX, "scheduling.validation.duration")
  .refine((value) => value % DURATION_STEP === 0, "scheduling.validation.duration");

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);

const justification = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null)
  .refine(
    (value) => value === null || (value.length >= JUSTIFICATION_MIN && value.length <= JUSTIFICATION_MAX),
    "scheduling.validation.justificationLength",
  );

const overrides = {
  confirmOverbooking: z.boolean().optional().default(false),
  exceptionJustification: justification,
};

export const bookingSchema = z.object({
  patientId: id,
  serviceId: id,
  professionalId: id,
  unitId: id,
  roomId: id.nullish().transform((value) => value ?? null),
  date,
  startTime: time,
  durationMinutes: duration.optional(),
  notes: optionalText(NOTES_MAX, "scheduling.validation.notesTooLong"),
  // PRD F10: a package to use for this appointment; only carried in the event.
  packageId: id.nullish(),
  ...overrides,
});
export type BookingInput = z.infer<typeof bookingSchema>;

export const recurrenceSchema = z.object({
  frequency: z.enum(SERIES_FREQUENCIES),
  weekdays: z.array(z.number().int().min(1).max(7)),
  endsAfter: z.coerce
    .number()
    .int()
    .nullish()
    .transform((value) => value ?? null),
  endsOn: date.nullish().transform((value) => value ?? null),
});

export const occurrenceResolutionSchema = z.discriminatedUnion("action", [
  z.object({ index: z.number().int().min(1), action: z.literal("SKIP") }),
  z.object({ index: z.number().int().min(1), action: z.literal("RETIME"), startTime: time }),
]);
export type OccurrenceResolution = z.infer<typeof occurrenceResolutionSchema>;

export const seriesSchema = bookingSchema.extend({
  recurrence: recurrenceSchema,
  resolutions: z.array(occurrenceResolutionSchema).max(52).optional().default([]),
});
export type SeriesInput = z.infer<typeof seriesSchema>;

export const updateSchema = z.object({
  appointmentId: id,
  version: z.number().int().min(1),
  serviceId: id.optional(),
  durationMinutes: duration.optional(),
  roomId: id.nullish(),
  notes: z
    .string()
    .trim()
    .max(NOTES_MAX, "scheduling.validation.notesTooLong")
    .nullish()
    .transform((value) => (value === undefined ? undefined : value || null)),
  // PRD F10: a string links the appointment to that package, null removes the link.
  packageId: id.nullish(),
  ...overrides,
});
export type UpdateInput = z.infer<typeof updateSchema>;

export const rescheduleSchema = z.object({
  appointmentId: id,
  version: z.number().int().min(1),
  date,
  startTime: time,
  professionalId: id,
  roomId: id.nullish().transform((value) => value ?? null),
  source: z.enum(["FORM", "DRAG"]).optional().default("FORM"),
  ...overrides,
});
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

export const statusChangeSchema = z.object({
  appointmentId: id,
  version: z.number().int().min(1),
  to: z.enum(APPOINTMENT_STATUSES),
  justification,
});

export const SERIES_SCOPES = ["THIS", "THIS_AND_FOLLOWING", "ALL_FUTURE"] as const;
export type SeriesScope = (typeof SERIES_SCOPES)[number];

export const cancelSchema = z.object({
  appointmentId: id,
  version: z.number().int().min(1),
  origin: z.enum(CANCELLATION_ORIGINS, "scheduling.validation.originRequired"),
  reasonId: z.uuid("scheduling.validation.reasonRequired"),
  note: optionalText(CANCELLATION_NOTE_MAX, "scheduling.validation.notesTooLong"),
  scope: z.enum(SERIES_SCOPES).optional().default("THIS"),
});

export const seriesEditSchema = z.object({
  appointmentId: id,
  scope: z.enum(["THIS_AND_FOLLOWING", "ALL_FUTURE"]),
  changes: z.object({
    startTime: time.optional(),
    professionalId: id.optional(),
    roomId: id.nullish(),
    durationMinutes: duration.optional(),
    notes: z
      .string()
      .trim()
      .max(NOTES_MAX, "scheduling.validation.notesTooLong")
      .nullish()
      .transform((value) => (value === undefined ? undefined : value || null)),
  }),
  resolutions: z.array(occurrenceResolutionSchema).max(52).optional().default([]),
  ...overrides,
});
export type SeriesEditInput = z.infer<typeof seriesEditSchema>;

const idList = z
  .union([z.array(z.uuid()), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const list = Array.isArray(value) ? value : value.split(",").filter(Boolean);
    return list.length > 0 ? list : undefined;
  });

export const agendaQuerySchema = z.object({
  unitId: z.union([z.uuid(), z.literal("all")]),
  from: date,
  to: date,
  professionalIds: idList,
  roomIds: idList,
  serviceIds: idList,
  statuses: z
    .union([z.array(z.enum(APPOINTMENT_STATUSES)), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const list = Array.isArray(value) ? value : value.split(",").filter(Boolean);
      const valid = list.filter((item): item is (typeof APPOINTMENT_STATUSES)[number] =>
        (APPOINTMENT_STATUSES as readonly string[]).includes(item),
      );
      return valid.length > 0 ? valid : undefined;
    }),
  since: z.iso.datetime().optional(),
});
export type AgendaQuery = z.infer<typeof agendaQuerySchema>;

export const listQuerySchema = agendaQuerySchema.omit({ since: true }).extend({
  patientId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const conflictPreviewSchema = z.object({
  appointmentId: z.uuid().optional(),
  patientId: z.uuid().optional(),
  serviceId: id,
  professionalId: id,
  unitId: id,
  roomId: id.nullish().transform((value) => value ?? null),
  date,
  startTime: time,
  durationMinutes: duration.optional(),
});

export const availabilitySchema = z.object({
  unitId: id,
  serviceId: id,
  professionalId: z.uuid().optional(),
  durationMinutes: duration.optional(),
});

export const agendaPdfSchema = z.object({ unitId: id, date, professionalId: id });

export const reasonNameSchema = z
  .string()
  .trim()
  .min(1, "scheduling.validation.reasonNameRequired")
  .max(REASON_NAME_MAX, "scheduling.validation.reasonNameTooLong");
export const createReasonSchema = z.object({ name: reasonNameSchema });
export const renameReasonSchema = z.object({ id, name: reasonNameSchema });
export const setReasonActiveSchema = z.object({ id, active: z.boolean() });
