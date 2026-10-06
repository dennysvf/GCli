import { z } from "zod";
import { ATTACHMENT_MAX_BYTES, FILE_NAME_MAX } from "../domain/limits";

// Zod schemas shared by the record screens, the routes and the use cases (PRD F07 Capabilities).
// The HTML is only checked for being text here: its length and content are decided after
// sanitizing, in content.ts.

const id = z.uuid("clinicalRecords.validation.invalid");
const version = z.coerce.number().int().min(1, "clinicalRecords.validation.invalid");
const html = z.string("clinicalRecords.validation.required");

export const saveDraftSchema = z
  .object({
    noteId: id.optional(),
    appointmentId: id.optional(),
    patientId: id.optional(),
    html,
    version: version.optional(),
  })
  .refine((value) => (value.noteId ? value.version !== undefined : true), {
    message: "clinicalRecords.validation.invalid",
    path: ["version"],
  })
  .refine((value) => value.noteId || value.appointmentId || value.patientId, {
    message: "clinicalRecords.validation.invalid",
    path: ["noteId"],
  });

export const noteContentSchema = z.object({ noteId: id, version, html });
export const noteVersionSchema = z.object({ noteId: id, version });
export const addAddendumSchema = z.object({ noteId: id, html });

export const uploadIntentSchema = z.object({
  noteId: id,
  fileName: z.string("clinicalRecords.validation.required").min(1).max(FILE_NAME_MAX),
  contentType: z.string("clinicalRecords.validation.required").min(1).max(100),
  size: z.coerce
    .number()
    .int()
    .min(1)
    .max(ATTACHMENT_MAX_BYTES * 2),
});

export const confirmAttachmentSchema = z.object({ uploadId: id });
export const attachmentIdSchema = z.object({ attachmentId: id });
export const attachmentVariantSchema = z.enum(["original", "converted"]);

export const updateAlertSchema = z.object({
  patientId: id,
  text: z.string("clinicalRecords.validation.required"),
  version: z.coerce.number().int().min(0).default(0),
});

export const recordQuerySchema = z.object({
  patientId: id,
  appointmentId: id.optional(),
  noteId: id.optional(),
  // "Novo registro avulso": a note without an appointment.
  standalone: z
    .union([z.boolean(), z.literal("1"), z.literal("true")])
    .optional()
    .transform((value) => value === true || value === "1" || value === "true"),
});

export const pageSchema = z.object({ patientId: id, page: z.coerce.number().int().min(1).default(1) });
