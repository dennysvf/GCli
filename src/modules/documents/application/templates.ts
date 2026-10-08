import { authorize } from "@/shared/authz/guard";
import { diffChanges } from "@/shared/audit/diff";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { createTranslator } from "@/shared/i18n/translator";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { DocumentsErrors } from "../domain/errors";
import { MAX_ACTIVE_TEMPLATES, TEMPLATE_MAX_CHARACTERS, TEMPLATE_MAX_HTML_BYTES } from "../domain/limits";
import { analyzeTemplate } from "../domain/template-variables";
import { DEFAULT_TEMPLATES, DEFAULT_TEMPLATE_BODIES } from "./default-templates";
import { requirePatientDocuments } from "./policies";
import type { DocumentsDeps } from "./ports";
import { lockOrganizationDocuments } from "./quota";
import {
  createTemplateSchema,
  listTemplatesSchema,
  setTemplateActiveSchema,
  templateIdSchema,
  updateTemplateSchema,
  type TemplateType,
} from "./schemas";
import { isUniqueViolation, organizationLocale } from "./support";

// Document templates (PRD F08 Capabilities): up to 50 active, a rich text body with variables, and
// three created by default. They are deactivated, never deleted, because generated documents
// reference the template and the version they used.

export type TemplateItem = {
  id: string;
  name: string;
  type: TemplateType;
  clinical: boolean;
  active: boolean;
  // The free fields of the body, in order of first use.
  fields: string[];
  version: number;
  // One of the three templates every organization starts with.
  system: boolean;
};

export type TemplateDetails = TemplateItem & { bodyHtml: string };

type TemplateRow = {
  id: string;
  name: string;
  type: string;
  isClinical: boolean;
  active: boolean;
  fields: unknown;
  version: number;
  systemKey: string | null;
};

export function toTemplateItem(row: TemplateRow): TemplateItem {
  return {
    id: row.id,
    name: row.name,
    type: row.type as TemplateType,
    clinical: row.isClinical,
    active: row.active,
    fields: Array.isArray(row.fields)
      ? row.fields.filter((field): field is string => typeof field === "string")
      : [],
    version: row.version,
    system: row.systemKey !== null,
  };
}

// Created on first use, in the organization's default language. The unique key of the default rows
// and ON CONFLICT DO NOTHING make two first uses at once safe.
export async function ensureDefaultTemplates(
  deps: DocumentsDeps,
  uow: UnitOfWork,
  organizationId: string,
): Promise<void> {
  if (
    (await uow.tx.documentTemplate.count({ where: { systemKey: { not: null } } })) >= DEFAULT_TEMPLATES.length
  ) {
    return;
  }
  const locale = await organizationLocale(uow);
  const t = createTranslator(locale);
  const created = await uow.tx.documentTemplate.createMany({
    data: DEFAULT_TEMPLATES.map((template) => {
      const clean = deps.sanitizer.sanitize(DEFAULT_TEMPLATE_BODIES[locale][template.key]);
      const analysis = analyzeTemplate(clean.html);
      return {
        id: newId(),
        organizationId,
        name: t(`documents.defaults.templates.${template.key}`),
        type: template.type,
        isClinical: template.clinical,
        bodyHtml: clean.html,
        bodyText: clean.text,
        fields: analysis.ok ? analysis.fields : [],
        systemKey: template.key,
      };
    }),
    skipDuplicates: true,
  });
  if (created.count > 0) {
    await uow.audit.record({
      action: "CREATE",
      entityType: "document_template",
      summary: "Modelos de documento padrão criados",
      metadata: { count: created.count },
    });
  }
}

// The body is sanitized on the server (ADR-032), its length checked in characters, and every token
// must be a known variable or a valid free field.
function validateBody(
  deps: DocumentsDeps,
  bodyHtml: string,
): Result<{ html: string; text: string; fields: string[] }> {
  const clean = deps.sanitizer.sanitize(bodyHtml);
  if (
    Buffer.byteLength(clean.html) > TEMPLATE_MAX_HTML_BYTES ||
    Array.from(clean.text).length > TEMPLATE_MAX_CHARACTERS
  ) {
    return fail(DocumentsErrors.templateTooLong());
  }
  if (clean.text.trim() === "") return fail(DocumentsErrors.templateEmpty());
  const analysis = analyzeTemplate(clean.html);
  if (!analysis.ok) {
    return fail(
      analysis.problem.code === "UNKNOWN_VARIABLE"
        ? DocumentsErrors.templateUnknownVariable(analysis.problem.variable)
        : DocumentsErrors.templateInvalidField(analysis.problem.field),
    );
  }
  return ok({ html: clean.html, text: clean.text, fields: analysis.fields });
}

async function nameTaken(uow: UnitOfWork, name: string, exceptId?: string): Promise<boolean> {
  const existing = await uow.tx.documentTemplate.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return !!existing;
}

// The list of the settings page (`setup:manage`), or, with `forPatientId`, the templates the user
// can issue for that patient: clinical ones only for those who pass the F07 records policy.
export async function listTemplates(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown = {},
): Promise<Result<TemplateItem[]>> {
  const parsed = parseInput(listTemplatesSchema, input);
  if (!parsed.ok) return parsed;
  const { forPatientId, includeInactive } = parsed.value;
  let clinicalAllowed = true;
  if (forPatientId) {
    const access = await requirePatientDocuments(deps, ctx, forPatientId, "document:generate");
    if (!access.ok) return access;
    clinicalAllowed = access.value.clinical;
  } else {
    const allowed = await authorize(ctx, "setup:manage");
    if (!allowed.ok) return allowed;
  }
  return withTransaction(ctx, async (uow) => {
    await ensureDefaultTemplates(deps, uow, ctx.organizationId);
    const rows = await uow.tx.documentTemplate.findMany({
      where: {
        ...(forPatientId || !includeInactive ? { active: true } : {}),
        ...(clinicalAllowed ? {} : { isClinical: false }),
      },
      orderBy: [{ name: "asc" }],
    });
    return ok(rows.map(toTemplateItem));
  });
}

export async function getTemplate(ctx: RequestContext, input: unknown): Promise<Result<TemplateDetails>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(templateIdSchema, input);
  if (!parsed.ok) return parsed;
  return withTransaction(ctx, async (uow) => {
    const row = await uow.tx.documentTemplate.findFirst({ where: { id: parsed.value.templateId } });
    if (!row) return fail(DocumentsErrors.templateNotFound());
    return ok({ ...toTemplateItem(row), bodyHtml: row.bodyHtml });
  });
}

export async function createTemplate(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ templateId: string }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createTemplateSchema, input);
  if (!parsed.ok) return parsed;
  const body = validateBody(deps, parsed.value.bodyHtml);
  if (!body.ok) return body;
  const { name, type, clinical } = parsed.value;
  try {
    return await withTransaction(ctx, async (uow) => {
      await ensureDefaultTemplates(deps, uow, ctx.organizationId);
      await lockOrganizationDocuments(uow, ctx.organizationId);
      if ((await uow.tx.documentTemplate.count({ where: { active: true } })) >= MAX_ACTIVE_TEMPLATES) {
        return fail(DocumentsErrors.templateLimit());
      }
      if (await nameTaken(uow, name)) return fail(DocumentsErrors.templateNameTaken());
      const id = newId();
      await uow.tx.documentTemplate.create({
        data: {
          id,
          organizationId: ctx.organizationId,
          name,
          type,
          isClinical: clinical,
          bodyHtml: body.value.html,
          bodyText: body.value.text,
          fields: body.value.fields,
          createdById: ctx.user.id,
          updatedById: ctx.user.id,
        },
      });
      await uow.audit.record({
        action: "CREATE",
        entityType: "document_template",
        entityId: id,
        summary: "Modelo de documento criado",
        changes: diffChanges(
          null,
          { name, type, clinical, bodyHtml: body.value.html },
          { sensitive: ["bodyHtml"] },
        ),
      });
      return ok({ templateId: id });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(DocumentsErrors.templateNameTaken());
    throw error;
  }
}

export async function updateTemplate(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ version: number }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(updateTemplateSchema, input);
  if (!parsed.ok) return parsed;
  const body = validateBody(deps, parsed.value.bodyHtml);
  if (!body.ok) return body;
  const { templateId, name, type, clinical, version } = parsed.value;
  try {
    return await withTransaction(ctx, async (uow) => {
      const before = await uow.tx.documentTemplate.findFirst({ where: { id: templateId } });
      if (!before) return fail(DocumentsErrors.templateNotFound());
      if (await nameTaken(uow, name, templateId)) return fail(DocumentsErrors.templateNameTaken());
      const updated = await uow.tx.documentTemplate.updateMany({
        where: { id: templateId, version },
        data: {
          name,
          type,
          isClinical: clinical,
          bodyHtml: body.value.html,
          bodyText: body.value.text,
          fields: body.value.fields,
          updatedById: ctx.user.id,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) return fail(DocumentsErrors.stale());
      await uow.audit.record({
        action: "UPDATE",
        entityType: "document_template",
        entityId: templateId,
        summary: "Modelo de documento atualizado",
        changes: diffChanges(
          { name: before.name, type: before.type, clinical: before.isClinical, bodyHtml: before.bodyHtml },
          { name, type, clinical, bodyHtml: body.value.html },
          { sensitive: ["bodyHtml"] },
        ),
      });
      return ok({ version: version + 1 });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(DocumentsErrors.templateNameTaken());
    throw error;
  }
}

export async function setTemplateActive(
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ version: number }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setTemplateActiveSchema, input);
  if (!parsed.ok) return parsed;
  const { templateId, active, version } = parsed.value;
  return withTransaction(ctx, async (uow) => {
    await lockOrganizationDocuments(uow, ctx.organizationId);
    const before = await uow.tx.documentTemplate.findFirst({ where: { id: templateId } });
    if (!before) return fail(DocumentsErrors.templateNotFound());
    if (active && !before.active) {
      if ((await uow.tx.documentTemplate.count({ where: { active: true } })) >= MAX_ACTIVE_TEMPLATES) {
        return fail(DocumentsErrors.templateLimit());
      }
    }
    const updated = await uow.tx.documentTemplate.updateMany({
      where: { id: templateId, version },
      data: { active, updatedById: ctx.user.id, version: { increment: 1 } },
    });
    if (updated.count === 0) return fail(DocumentsErrors.stale());
    await uow.audit.record({
      action: "UPDATE",
      entityType: "document_template",
      entityId: templateId,
      summary: active ? "Modelo de documento ativado" : "Modelo de documento desativado",
      changes: diffChanges({ active: before.active }, { active }),
    });
    return ok({ version: version + 1 });
  });
}
