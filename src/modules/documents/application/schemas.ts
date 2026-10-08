import { z } from "zod";
import {
  ARCHIVE_REASON_MAX,
  ARCHIVE_REASON_MIN,
  CATEGORY_NAME_MAX,
  FIELD_VALUE_MAX,
  FILE_NAME_MAX,
  MAX_FILE_BYTES,
  TEMPLATE_MAX_HTML_BYTES,
  TEMPLATE_NAME_MAX,
  TITLE_MAX,
} from "../domain/limits";

// Zod schemas shared by the screens, the routes and the use cases (PRD F08 Capabilities). Messages
// are catalog keys (ADR-028).

const invalid = "documents.validation.invalid";
const required = "documents.validation.required";

const id = z.uuid(invalid);
const version = z.coerce.number().int().min(1, invalid);
const title = z.string(required).trim().min(1, required).max(TITLE_MAX, "documents.validation.titleTooLong");

export const TEMPLATE_TYPES = [
  "CERTIFICATE",
  "ATTENDANCE_DECLARATION",
  "PRESCRIPTION",
  "REFERRAL",
  "OTHER",
] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const uploadIntentSchema = z.object({
  patientId: id,
  categoryId: id,
  title: title.optional(),
  fileName: z.string(required).min(1, required).max(FILE_NAME_MAX),
  contentType: z.string(required).min(1, required).max(100),
  // Twice the limit passes the schema so the use case can answer with the PRD message.
  size: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_FILE_BYTES * 2),
});

export const confirmUploadSchema = z.object({ uploadId: id });
export const documentIdSchema = z.object({ documentId: id });
export const downloadVariantSchema = z.enum(["original", "converted"]).default("converted");
export const dispositionSchema = z.enum(["inline", "attachment"]).default("inline");

const flag = z
  .union([z.boolean(), z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
  .transform((value) => value === true || value === "1" || value === "true");

export const listDocumentsSchema = z.object({
  patientId: id,
  categoryId: id.optional(),
  kind: z.enum(["UPLOADED", "GENERATED"]).optional(),
  includeArchived: flag.optional().default(false),
  cursor: z.string().max(200).optional(),
});

export const updateDocumentSchema = z.object({ documentId: id, title, categoryId: id, version });
export const archiveDocumentSchema = z.object({
  documentId: id,
  reason: z
    .string(required)
    .trim()
    .min(ARCHIVE_REASON_MIN, "documents.errors.DOCUMENT_ARCHIVE_REASON_REQUIRED")
    .max(ARCHIVE_REASON_MAX),
  version,
});
export const restoreDocumentSchema = z.object({ documentId: id, version });

export const createCategorySchema = z.object({
  name: z.string(required).trim().min(1, required).max(CATEGORY_NAME_MAX),
  clinical: z.boolean().default(false),
});
export const updateCategorySchema = createCategorySchema.extend({ categoryId: id, version });
export const setCategoryActiveSchema = z.object({ categoryId: id, active: z.boolean(), version });
export const listCategoriesSchema = z.object({ includeInactive: flag.optional().default(false) });

const templateFields = {
  name: z.string(required).trim().min(1, required).max(TEMPLATE_NAME_MAX),
  type: z.enum(TEMPLATE_TYPES, invalid),
  clinical: z.boolean().default(false),
  bodyHtml: z.string(required).max(TEMPLATE_MAX_HTML_BYTES * 2),
};
export const createTemplateSchema = z.object(templateFields);
export const updateTemplateSchema = z.object({ ...templateFields, templateId: id, version });
export const setTemplateActiveSchema = z.object({ templateId: id, active: z.boolean(), version });
export const templateIdSchema = z.object({ templateId: id });
export const listTemplatesSchema = z.object({
  forPatientId: id.optional(),
  includeInactive: flag.optional().default(false),
});

const fieldValues = z.record(
  z.string(),
  z.string().max(FIELD_VALUE_MAX, "documents.validation.fieldTooLong"),
);

export const previewDocumentSchema = z.object({
  patientId: id,
  templateId: id,
  professionalId: id,
  unitId: id,
  fields: fieldValues.default({}),
});
export const generateDocumentSchema = previewDocumentSchema.extend({
  confirmMissing: z.boolean().default(false),
});
