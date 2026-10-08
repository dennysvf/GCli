import { recordDenial } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { createTranslator } from "@/shared/i18n/translator";
import { newId } from "@/shared/kernel/ids";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { objectKey } from "@/shared/storage/object-storage";
import { ISSUED_CATEGORY_KEY } from "../domain/categories";
import { DocumentsErrors } from "../domain/errors";
import { DOCUMENTS_EVENTS, documentEvent } from "../domain/events";
import { GENERATION_TIMEOUT_MS } from "../domain/limits";
import {
  KNOWN_VARIABLES,
  VARIABLE_KEYS,
  fieldLabel,
  isFieldToken,
  fieldNameOf,
  substituteTemplate,
  type VariableName,
} from "../domain/template-variables";
import { ensureDefaultCategories } from "./categories";
import { requirePatientDocuments } from "./policies";
import type { DocumentsDeps } from "./ports";
import { chargeUsage } from "./quota";
import { generateDocumentSchema, previewDocumentSchema } from "./schemas";
import { ensureDefaultTemplates, listTemplates, type TemplateItem } from "./templates";
import { resolveVariables } from "./variables";

// Issuing a document from a template (PRD F08): the live preview and the PDF. Both go through the
// same authorization and the same resolved values, so what the user sees is what is printed.

export type MissingItem = { variable: string; message: string };

export type DocumentPreview = {
  title: string;
  // Escaped values in a sanitized body; a missing value is wrapped in <mark data-missing>.
  html: string;
  fields: { name: string; label: string; value: string }[];
  missing: MissingItem[];
  signature: { name: string; registration: string | null };
  footer: string;
  clinical: boolean;
};

type Prepared = {
  patientId: string;
  confirmMissing: boolean;
  template: {
    id: string;
    name: string;
    bodyHtml: string;
    version: number;
    isClinical: boolean;
    fields: string[];
  };
  patientName: string;
  professionalId: string;
  unitId: string;
  signature: { name: string; registration: string | null };
  footer: string;
  clinicName: string;
  logo: { data: Buffer; format: "png" | "jpg" } | null;
  render: (mode: "preview" | "pdf") => { html: string; missing: MissingItem[] };
  fieldValues: Record<string, string>;
  timeZone: string;
};

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("document generation timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Authorizes and gathers everything the document is made of. A clinical template is for those who
// pass the F07 records policy and is always signed by the user's own professional profile; a
// non-clinical one accepts any active professional (spec F08, interview).
async function prepare(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown,
  schema: typeof previewDocumentSchema,
): Promise<Result<Prepared>> {
  const parsed = parseInput(schema, input);
  if (!parsed.ok) return parsed;
  const { patientId, templateId, professionalId, unitId, fields } = parsed.value;
  const access = await requirePatientDocuments(deps, ctx, patientId, "document:generate");
  if (!access.ok) return access;

  const loaded = await withTransaction(ctx, async (uow) => {
    await ensureDefaultTemplates(deps, uow, ctx.organizationId);
    return ok(await uow.tx.documentTemplate.findFirst({ where: { id: templateId, active: true } }));
  });
  if (!loaded.ok) return loaded;
  const template = loaded.value;
  if (!template) return fail(DocumentsErrors.templateNotFound());

  if (template.isClinical) {
    if (!access.value.clinical) {
      await recordDenial(ctx, "document:generate", template.id);
      return fail(DocumentsErrors.templateClinicalOnly());
    }
    if (ctx.linkedProfessionalId !== professionalId) return fail(DocumentsErrors.signerNotAllowed());
  }

  const [unit, organization, professionals] = await Promise.all([
    deps.directory.unit(ctx, unitId),
    deps.directory.organization(ctx),
    template.isClinical ? Promise.resolve(null) : deps.directory.professionals(ctx),
  ]);
  if (!unit || !unit.active) return fail(DocumentsErrors.unitInvalid());
  if (professionals && !professionals.some((option) => option.id === professionalId && option.active)) {
    return fail(DocumentsErrors.professionalInvalid());
  }
  const professional = await deps.directory.professional(ctx, professionalId, unit.country);
  if (!professional) return fail(DocumentsErrors.professionalInvalid());

  const t = createTranslator(ctx.locale);
  const values = resolveVariables({
    patient: access.value.patient,
    professional,
    unit,
    organization,
    now: deps.clock(),
    locale: ctx.locale,
  });
  const templateFields = Array.isArray(template.fields)
    ? template.fields.filter((field): field is string => typeof field === "string")
    : [];
  const fieldValues = Object.fromEntries(templateFields.map((name) => [name, (fields[name] ?? "").trim()]));
  const labelOf = (variable: string) =>
    isFieldToken(variable)
      ? fieldLabel(fieldNameOf(variable))
      : KNOWN_VARIABLES.includes(variable)
        ? t(`documents.variables.${VARIABLE_KEYS[variable as VariableName]}`)
        : variable;
  const messageOf = (variable: string) =>
    isFieldToken(variable)
      ? t("documents.missing.field", { label: fieldLabel(fieldNameOf(variable)) })
      : t(`documents.missing.${VARIABLE_KEYS[variable as VariableName]}`);

  return ok({
    patientId,
    confirmMissing: (parsed.value as { confirmMissing?: boolean }).confirmMissing === true,
    template: {
      id: template.id,
      name: template.name,
      bodyHtml: template.bodyHtml,
      version: template.version,
      isClinical: template.isClinical,
      fields: templateFields,
    },
    patientName: access.value.patient.displayName,
    professionalId,
    unitId,
    signature: { name: professional.displayName, registration: professional.registration },
    footer: [unit.name, unit.formattedAddress, unit.phone].filter((part) => part && part.trim()).join(" · "),
    clinicName: organization.name,
    logo: organization.logo,
    fieldValues,
    timeZone: unit.timeZone,
    render: (mode) => {
      const result = substituteTemplate(template.bodyHtml, {
        values,
        fields: fieldValues,
        mode,
        label: labelOf,
      });
      return {
        html: result.html,
        missing: result.missing.map((item) => ({
          variable: item.variable,
          message: messageOf(item.variable),
        })),
      };
    },
  });
}

// What the emission dialog shows while the user fills the fields (PRD F08 Experience). Nothing is
// stored and nothing is audited: it only reads what the user may already see.
export async function previewDocument(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<DocumentPreview>> {
  const prepared = await prepare(deps, ctx, input, previewDocumentSchema);
  if (!prepared.ok) return prepared;
  const { template } = prepared.value;
  const rendered = prepared.value.render("preview");
  return ok({
    title: template.name,
    html: rendered.html,
    fields: template.fields.map((name) => ({
      name,
      label: fieldLabel(name),
      value: prepared.value.fieldValues[name] ?? "",
    })),
    missing: rendered.missing,
    signature: prepared.value.signature,
    footer: prepared.value.footer,
    clinical: template.isClinical,
  });
}

// Renders the PDF, stores it and records the document, or leaves nothing behind (PRD F08: "no
// partial document is saved"). Generated PDFs are counted in the quota but never blocked by it.
export async function generateDocument(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ documentId: string; openUrl: string }>> {
  const prepared = await prepare(deps, ctx, input, generateDocumentSchema);
  if (!prepared.ok) return prepared;
  const value = prepared.value;
  const { patientId, confirmMissing } = value;
  const rendered = value.render("pdf");
  if (rendered.missing.length > 0 && !confirmMissing) {
    return fail(DocumentsErrors.missingValues(rendered.missing));
  }

  const t = createTranslator(ctx.locale);
  const now = deps.clock();
  const key = objectKey(ctx.organizationId, "documents", newId());
  let stored = false;
  try {
    const bytes = await withTimeout(
      deps.pdf.render({
        documentTitle: value.template.name,
        clinicName: value.clinicName,
        logo: value.logo,
        title: value.template.name,
        bodyHtml: rendered.html,
        signature: value.signature,
        footerNote: value.footer,
        pageLabel: t("documents.pdf.page", { page: "{page}", total: "{total}" }),
      }),
      GENERATION_TIMEOUT_MS,
    );
    await deps.storage.put(key, new Uint8Array(bytes), "application/pdf");
    stored = true;
    const documentId = newId();
    const fileName = `${slugify(value.template.name) || "documento"}-${dateInTimeZone(now, value.timeZone)}.pdf`;
    const result = await withTransaction(ctx, async (uow) => {
      await ensureDefaultCategories(uow, ctx.organizationId);
      const issued = await uow.tx.documentCategory.findFirst({ where: { systemKey: ISSUED_CATEGORY_KEY } });
      if (!issued) return fail(DocumentsErrors.generationFailed());
      const charged = await chargeUsage(deps, ctx, uow, ctx.organizationId, bytes.length, { enforce: false });
      if (!charged.ok) return charged;
      await uow.tx.patientDocument.create({
        data: {
          id: documentId,
          organizationId: ctx.organizationId,
          patientId,
          kind: "GENERATED",
          categoryId: issued.id,
          title: value.template.name,
          isClinical: value.template.isClinical,
          status: "READY",
          fileName,
          sourceContentType: "application/pdf",
          sourceObjectKey: key,
          objectKey: key,
          contentType: "application/pdf",
          sizeBytes: bytes.length,
          storedBytes: bytes.length,
          authorUserId: ctx.user.id,
          professionalId: value.professionalId,
          unitId: value.unitId,
          templateId: value.template.id,
          templateVersion: value.template.version,
          fieldValues: value.fieldValues,
        },
      });
      await uow.audit.record({
        action: "CREATE",
        entityType: "patient_document",
        entityId: documentId,
        summary: "Documento do paciente emitido",
        metadata: { templateId: value.template.id, clinical: value.template.isClinical, size: bytes.length },
      });
      await uow.publish(
        documentEvent(
          DOCUMENTS_EVENTS.added,
          {
            documentId,
            patientId,
            kind: "GENERATED",
            clinical: value.template.isClinical,
            actorUserId: ctx.user.id,
          },
          now,
        ),
      );
      return ok({ documentId, openUrl: `/api/documents/${documentId}?disposition=inline` });
    });
    if (!result.ok) {
      await deps.storage.delete(key).catch(() => undefined);
      return result.error.code === "DOCUMENT_GENERATION_FAILED"
        ? result
        : fail(DocumentsErrors.generationFailed());
    }
    return result;
  } catch {
    if (stored) await deps.storage.delete(key).catch(() => undefined);
    return fail(DocumentsErrors.generationFailed());
  }
}

export type IssueOptions = {
  templates: TemplateItem[];
  professionals: { id: string; displayName: string }[];
  units: { id: string; name: string }[];
  defaultUnitId: string | null;
  // The professional profile of the user: the only signer of clinical templates.
  linkedProfessionalId: string | null;
};

// What the "Emitir documento" dialog offers this user for this patient (PRD F08 Experience): the
// templates they may issue, the active professionals and units, and the pre-filled unit.
export async function getIssueOptions(
  deps: DocumentsDeps,
  ctx: RequestContext,
  patientId: string,
): Promise<Result<IssueOptions>> {
  const templates = await listTemplates(deps, ctx, { forPatientId: patientId });
  if (!templates.ok) return templates;
  const [professionals, units, selectedUnitId] = await Promise.all([
    deps.directory.professionals(ctx),
    deps.directory.units(ctx),
    deps.directory.selectedUnitId(ctx),
  ]);
  const unitIds = units.map((unit) => unit.id);
  return ok({
    templates: templates.value,
    professionals: professionals
      .filter((professional) => professional.active)
      .map(({ id, displayName }) => ({ id, displayName })),
    units: units.map(({ id, name }) => ({ id, name })),
    defaultUnitId: selectedUnitId && unitIds.includes(selectedUnitId) ? selectedUnitId : (unitIds[0] ?? null),
    linkedProfessionalId: ctx.linkedProfessionalId,
  });
}
