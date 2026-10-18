import { z } from "zod";
import { isValidDate } from "@/shared/kernel/calendar-date";
import { REQUEST_STATUSES, REQUEST_TYPES, REQUESTER_KINDS } from "../domain/lgpd-request";
import {
  REQUEST_DESCRIPTION_MAX,
  REQUEST_DESCRIPTION_MIN,
  RESOLUTION_MAX,
  RESOLUTION_MIN,
} from "../domain/limits";
import { TIMELINE_GROUPS } from "../domain/timeline-event";

// Zod schemas of the privacy actions. Messages are catalog keys (privacy.validation.*, ADR-028).
const id = z.uuid("privacy.validation.invalidId");
const calendarDate = z
  .string()
  .refine((value) => isValidDate(value), "privacy.validation.invalidDate")
  .nullish()
  .transform((value) => value ?? null);

export const timelineQuerySchema = z
  .object({
    patientId: id,
    groups: z
      .array(z.enum(TIMELINE_GROUPS))
      .max(TIMELINE_GROUPS.length)
      .refine((groups) => new Set(groups).size === groups.length, "privacy.validation.groupsInvalid")
      .default([]),
    from: calendarDate,
    to: calendarDate,
    cursor: z
      .string()
      .max(200)
      .nullish()
      .transform((value) => value || null),
  })
  .refine((value) => (value.from === null) === (value.to === null), {
    message: "privacy.validation.periodIncomplete",
    path: ["to"],
  });

export const timelineNoteSchema = z.object({ patientId: id, noteId: id });

export const listRequestsSchema = z.object({
  status: z.enum(["OPEN", "ALL", ...REQUEST_STATUSES]).default("OPEN"),
  type: z.enum(["ALL", ...REQUEST_TYPES]).default("ALL"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const requestIdSchema = z.object({ requestId: id });

export const createRequestSchema = z.object({
  patientId: z.uuid("privacy.validation.patientRequired"),
  type: z.enum(REQUEST_TYPES, "privacy.validation.typeRequired"),
  requestedBy: z.enum(REQUESTER_KINDS, "privacy.validation.requesterRequired"),
  description: z
    .string({ error: "privacy.validation.descriptionMin" })
    .trim()
    .min(REQUEST_DESCRIPTION_MIN, "privacy.validation.descriptionMin")
    .max(REQUEST_DESCRIPTION_MAX, "privacy.validation.descriptionMax"),
});

export const completeRequestSchema = z.object({
  requestId: id,
  resolution: z
    .string({ error: "privacy.validation.resolutionMin" })
    .trim()
    .min(RESOLUTION_MIN, "privacy.validation.resolutionMin")
    .max(RESOLUTION_MAX, "privacy.validation.resolutionMax"),
});

export const exportIdSchema = z.object({ exportId: id });

export const anonymizeSchema = z.object({
  requestId: id,
  typedName: z.string({ error: "privacy.validation.nameRequired" }).max(300),
  version: z.number().int().min(1),
});

export type TimelineQueryInput = z.infer<typeof timelineQuerySchema>;
export type ListRequestsInput = z.infer<typeof listRequestsSchema>;
