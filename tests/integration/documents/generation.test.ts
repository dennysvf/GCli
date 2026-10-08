import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDocuments, documents, type DocumentPdfInput } from "@/modules/documents";
import { units } from "@/modules/units";
import { db } from "@/shared/db/client";
import { formatLongDate } from "@/shared/i18n/calendar-names";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { objectStorage } from "@/shared/storage/object-storage";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { appointmentFor } from "../clinical-records/support";
import { documentsWorld, type DocumentsWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

const QUOTA = 50 * 1024 * 1024 * 1024;
const CPF = "52998224725";

let world: DocumentsWorld;
beforeEach(async () => {
  world = await documentsWorld();
  // Ana has an appointment with Maria, so she passes the F07 records policy for her.
  await appointmentFor(world);
});

async function templateNamed(name: string) {
  const listed = await documents.listTemplates(world.manager, {});
  if (!listed.ok) throw new Error("listTemplates failed");
  const found = listed.value.find((item) => item.name === name);
  if (!found) throw new Error(`template ${name} not found`);
  return found;
}

async function withCpf(patientId = world.patients.maria) {
  await db().patient.update({
    where: { id: patientId },
    data: { documentCountry: "BR", documentType: "CPF", documentNumber: CPF },
  });
}

const issue = (
  ctx: DocumentsWorld["pro"],
  templateId: string,
  extra: Record<string, unknown> = {},
  professionalId = world.professionals.ana,
) => ({
  patientId: world.patients.maria,
  templateId,
  professionalId,
  unitId: world.unitId,
  fields: { dias_afastamento: "2" },
  ...extra,
  _ctx: ctx,
});

async function generate(input: ReturnType<typeof issue>) {
  const { _ctx, ...rest } = input;
  return documents.generateDocument(_ctx, rest);
}

async function preview(input: ReturnType<typeof issue>) {
  const { _ctx, ...rest } = input;
  return documents.previewDocument(_ctx, rest);
}

describe("templates", () => {
  it("F08: the three default templates are created once, in the organization's language", async () => {
    await resetDatabase();
    const english = await documentsWorld();
    await db().organization.update({ where: { id: english.organizationId }, data: { defaultLocale: "en" } });
    const results = await Promise.all([1, 2, 3].map(() => documents.listTemplates(english.manager, {})));
    expect(results.every((result) => result.ok)).toBe(true);
    const rows = await db().documentTemplate.findMany({ orderBy: { name: "asc" } });
    expect(rows.map((row) => row.name)).toEqual([
      "Attendance declaration",
      "Medical certificate",
      "Simple prescription",
    ]);
    expect(rows.filter((row) => row.isClinical).map((row) => row.systemKey)).toEqual([
      "CERTIFICATE",
      "PRESCRIPTION",
    ]);
    expect(rows.find((row) => row.systemKey === "CERTIFICATE")?.fields).toEqual(["dias_afastamento"]);
  });

  it("F08: template limits — 50 active templates, unknown variables and 20,000 characters", async () => {
    const body = "<p>{{paciente.nome}}</p>";
    const base = { type: "OTHER", clinical: false, bodyHtml: body };
    const denied = await documents.createTemplate(world.desk, { ...base, name: "Modelo" });
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");

    const unknown = await documents.createTemplate(world.manager, {
      ...base,
      name: "A",
      bodyHtml: "<p>{{paciente.rg}}</p>",
    });
    expect(!unknown.ok && unknown.error).toMatchObject({
      code: "DOCUMENT_TEMPLATE_UNKNOWN_VARIABLE",
      params: { variable: "paciente.rg" },
    });
    const badField = await documents.createTemplate(world.manager, {
      ...base,
      name: "B",
      bodyHtml: "<p>{{campo:Dias}}</p>",
    });
    expect(!badField.ok && badField.error.code).toBe("DOCUMENT_TEMPLATE_INVALID_FIELD");
    const empty = await documents.createTemplate(world.manager, { ...base, name: "C", bodyHtml: "<p> </p>" });
    expect(!empty.ok && empty.error.code).toBe("DOCUMENT_TEMPLATE_EMPTY");
    const long = await documents.createTemplate(world.manager, {
      ...base,
      name: "D",
      bodyHtml: `<p>${"a".repeat(20_001)}</p>`,
    });
    expect(!long.ok && long.error.code).toBe("DOCUMENT_TEMPLATE_TOO_LONG");
    const boundary = await documents.createTemplate(world.manager, {
      ...base,
      name: "E",
      bodyHtml: `<p>${"a".repeat(20_000)}</p>`,
    });
    expect(boundary.ok).toBe(true);
    const duplicate = await documents.createTemplate(world.manager, { ...base, name: "e" });
    expect(!duplicate.ok && duplicate.error.code).toBe("DOCUMENT_TEMPLATE_NAME_TAKEN");

    // 3 defaults + E = 4 active; 46 more fill the 50.
    for (let index = 0; index < 46; index += 1) {
      const created = await documents.createTemplate(world.manager, { ...base, name: `Modelo ${index}` });
      expect(created.ok).toBe(true);
    }
    const over = await documents.createTemplate(world.manager, { ...base, name: "Modelo 51" });
    expect(!over.ok && over.error.code).toBe("DOCUMENT_TEMPLATE_LIMIT");
    // A deactivated template frees a place, and reactivating it at the limit is refused.
    const first = await templateNamed("Modelo 0");
    expect(
      (
        await documents.setTemplateActive(world.manager, {
          templateId: first.id,
          active: false,
          version: first.version,
        })
      ).ok,
    ).toBe(true);
    expect((await documents.createTemplate(world.manager, { ...base, name: "Modelo 51" })).ok).toBe(true);
    const again = await documents.setTemplateActive(world.manager, {
      templateId: first.id,
      active: true,
      version: first.version + 1,
    });
    expect(!again.ok && again.error.code).toBe("DOCUMENT_TEMPLATE_LIMIT");
  });

  it("F08: a template is edited with a version and its free fields are listed in order", async () => {
    const created = await documents.createTemplate(world.manager, {
      name: "Encaminhamento",
      type: "REFERRAL",
      clinical: true,
      bodyHtml: "<p>{{campo:destino}} {{campo:motivo}} {{campo:destino}}</p><script>x()</script>",
    });
    if (!created.ok) throw new Error("create failed");
    const details = await documents.getTemplate(world.manager, { templateId: created.value.templateId });
    expect(details.ok && details.value).toMatchObject({
      fields: ["destino", "motivo"],
      bodyHtml: "<p>{{campo:destino}} {{campo:motivo}} {{campo:destino}}</p>",
    });
    const edited = await documents.updateTemplate(world.manager, {
      templateId: created.value.templateId,
      name: "Encaminhamento",
      type: "REFERRAL",
      clinical: true,
      bodyHtml: "<p>{{campo:motivo}}</p>",
      version: 1,
    });
    expect(edited.ok && edited.value.version).toBe(2);
    const stale = await documents.updateTemplate(world.manager, {
      templateId: created.value.templateId,
      name: "Encaminhamento",
      type: "REFERRAL",
      clinical: true,
      bodyHtml: "<p>{{campo:motivo}}</p>",
      version: 1,
    });
    expect(!stale.ok && stale.error.code).toBe("DOCUMENT_STALE");
    // The audit keeps the body out as text.
    const audited = (await auditEvents({ entityId: created.value.templateId })).find(
      (event) => event.summary === "Modelo de documento atualizado",
    );
    expect(JSON.stringify(audited?.changes)).not.toContain("motivo");
  });
});

describe("issuing documents", () => {
  it("F08: generating a document replaces every variable and saves the PDF in 5 seconds or less", async () => {
    await withCpf();
    await db().organization.update({
      where: { id: world.organizationId },
      data: { taxId: "11222333000181" },
    });
    const created = await documents.createTemplate(world.manager, {
      name: "Tudo",
      type: "OTHER",
      clinical: false,
      bodyHtml:
        "<p>{{paciente.nome}} {{paciente.cpf}} {{paciente.data_nascimento}} {{profissional.nome}} {{profissional.registro}} {{unidade.nome}} {{unidade.endereco}} {{clinica.nome}} {{clinica.cnpj}} {{data_hoje}} {{data_extenso}} {{campo:nota}}</p>",
    });
    if (!created.ok) throw new Error("create failed");
    const input = issue(world.pro, created.value.templateId, { fields: { nota: "Observação" } });
    const shown = await preview(input);
    if (!shown.ok) throw new Error(`preview failed: ${shown.error.code}`);
    expect(shown.value.html).not.toContain("{{");
    expect(shown.value.html).not.toContain("data-missing");
    expect(shown.value.html).toContain("529.982.247-25");
    expect(shown.value.html).toContain("11.222.333/0001-81");
    expect(shown.value.html).toContain("Observação");
    expect(shown.value.missing).toEqual([]);

    const started = Date.now();
    const generated = await generate(input);
    const elapsed = Date.now() - started;
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    expect(elapsed).toBeLessThanOrEqual(5000);
    const row = await db().patientDocument.findUniqueOrThrow({
      where: { id: generated.value.documentId },
      include: { category: true },
    });
    expect(row).toMatchObject({
      kind: "GENERATED",
      title: "Tudo",
      isClinical: false,
      status: "READY",
      templateVersion: 1,
      fieldValues: { nota: "Observação" },
    });
    expect(row.category.systemKey).toBe("ISSUED");
    expect(row.professionalId).toBe(world.professionals.ana);
    const stored = await objectStorage().get(row.objectKey ?? "");
    expect(
      Buffer.from(stored?.body ?? [])
        .subarray(0, 5)
        .toString("latin1"),
    ).toBe("%PDF-");
    expect(generated.value.openUrl).toBe(`/api/documents/${row.id}?disposition=inline`);
    // The document is listed, audited and counted in the quota.
    const list = await documents.listPatientDocuments(world.pro, {
      patientId: world.patients.maria,
      kind: "GENERATED",
    });
    expect(list.ok && list.value.items.map((item) => item.id)).toEqual([row.id]);
    expect(
      (await auditEvents({ entityId: row.id })).some(
        (event) => event.summary === "Documento do paciente emitido",
      ),
    ).toBe(true);
    const usage = await documents.getStorageUsage(world.pro);
    expect(usage.ok && usage.value.usedBytes).toBe(row.sizeBytes);
  });

  it("F08: missing variable values are highlighted and need confirmation", async () => {
    // Maria has no CPF, and the free field is empty.
    const certificate = await templateNamed("Atestado");
    const input = issue(world.pro, certificate.id, { fields: {} });
    const shown = await preview(input);
    if (!shown.ok) throw new Error("preview failed");
    expect(shown.value.html).toContain('<mark data-missing="paciente.cpf">');
    expect(shown.value.html).toContain('<mark data-missing="campo:dias_afastamento">');
    expect(shown.value.missing.map((item) => item.variable)).toEqual([
      "paciente.cpf",
      "campo:dias_afastamento",
    ]);
    expect(shown.value.missing[0]?.message).toBe("O CPF do paciente não está cadastrado.");

    const blocked = await generate(input);
    expect(!blocked.ok && blocked.error.code).toBe("DOCUMENT_MISSING_VALUES");
    expect(!blocked.ok && blocked.error.details).toMatchObject({
      missing: [{ variable: "paciente.cpf" }, { variable: "campo:dias_afastamento" }],
    });
    expect(await db().patientDocument.count()).toBe(0);

    const confirmed = await generate({ ...input, confirmMissing: true } as ReturnType<typeof issue>);
    expect(confirmed.ok).toBe(true);
    expect(await db().patientDocument.count()).toBe(1);
  });

  it("F08: Front Desk users cannot generate clinical templates, and the denial is audited", async () => {
    const certificate = await templateNamed("Atestado");
    const declaration = await templateNamed("Declaração de comparecimento");
    const denied = await generate(issue(world.desk, certificate.id));
    expect(!denied.ok && denied.error.code).toBe("DOCUMENT_TEMPLATE_CLINICAL_ONLY");
    expect(
      (await auditEvents({ action: "PERMISSION_DENIED" })).some(
        (event) => (event.metadata as { target?: string } | null)?.target === certificate.id,
      ),
    ).toBe(true);
    expect(await db().patientDocument.count()).toBe(0);

    // Front Desk sees only the templates it may issue, and the professional sees all three.
    const forDesk = await documents.listTemplates(world.desk, { forPatientId: world.patients.maria });
    expect(forDesk.ok && forDesk.value.map((item) => item.name)).toEqual(["Declaração de comparecimento"]);
    const forPro = await documents.listTemplates(world.pro, { forPatientId: world.patients.maria });
    expect(forPro.ok && forPro.value).toHaveLength(3);
    // The settings list is for managers only.
    const settings = await documents.listTemplates(world.desk, {});
    expect(!settings.ok && settings.error.code).toBe("AUTHZ_FORBIDDEN");

    // The non-clinical declaration is issued by Front Desk, with any active professional.
    const issued = await generate(
      issue(
        world.desk,
        declaration.id,
        { fields: { hora_inicio: "09:00", hora_fim: "10:00" } },
        world.professionals.bruno,
      ),
    );
    expect(issued.ok).toBe(true);
  });

  it("F08: clinical templates are signed only by the user's own professional profile", async () => {
    const certificate = await templateNamed("Atestado");
    const other = await generate(issue(world.pro, certificate.id, {}, world.professionals.bruno));
    expect(!other.ok && other.error.code).toBe("DOCUMENT_SIGNER_NOT_ALLOWED");
    // A professional with no appointment with the patient is not allowed at all.
    const outsider = await generate({
      ...issue(world.brunoPro, certificate.id, {}, world.professionals.bruno),
    });
    expect(!outsider.ok && outsider.error.code).toBe("AUTHZ_FORBIDDEN");
    // An inactive professional cannot sign a non-clinical document either.
    const declaration = await templateNamed("Declaração de comparecimento");
    await db().professional.update({ where: { id: world.professionals.bruno }, data: { active: false } });
    const inactive = await generate(issue(world.desk, declaration.id, {}, world.professionals.bruno));
    expect(!inactive.ok && inactive.error.code).toBe("DOCUMENT_PROFESSIONAL_INVALID");
    const wrongUnit = await generate({
      ...issue(world.desk, declaration.id),
      unitId: "00000000-0000-7000-8000-000000000000",
    });
    expect(!wrongUnit.ok && wrongUnit.error.code).toBe("DOCUMENT_UNIT_INVALID");
  });

  it("F08: generated PDFs are counted in the quota but never blocked by it", async () => {
    await db().documentStorageUsage.upsert({
      where: { organizationId: world.organizationId },
      create: { organizationId: world.organizationId, usedBytes: BigInt(QUOTA) },
      update: { usedBytes: BigInt(QUOTA) },
    });
    const declaration = await templateNamed("Declaração de comparecimento");
    const generated = await generate(
      issue(
        world.desk,
        declaration.id,
        { fields: { hora_inicio: "9h", hora_fim: "10h" } },
        world.professionals.ana,
      ),
    );
    expect(generated.ok).toBe(true);
    const usage = await db().documentStorageUsage.findUniqueOrThrow({
      where: { organizationId: world.organizationId },
    });
    expect(Number(usage.usedBytes)).toBeGreaterThan(QUOTA);
  });

  it("F08: a failed render or storage error leaves no document and no object", async () => {
    const declaration = await templateNamed("Declaração de comparecimento");
    const stored: string[] = [];
    const deleted: string[] = [];
    // The real adapters, with the storage recording what is written and removed.
    const recording = (adjust: Parameters<typeof createDocuments>[0] = (base) => base) =>
      createDocuments((base) => {
        const adjusted = adjust(base);
        return {
          ...adjusted,
          storage: {
            ...adjusted.storage,
            put: async (key, body, contentType) => {
              await adjusted.storage.put(key, body, contentType);
              stored.push(key);
            },
            delete: async (key) => {
              deleted.push(key);
              await adjusted.storage.delete(key);
            },
          },
        };
      });
    const input = {
      ...issue(
        world.desk,
        declaration.id,
        { fields: { hora_inicio: "9h", hora_fim: "10h" } },
        world.professionals.ana,
      ),
    };
    const { _ctx, ...rest } = input;

    const brokenRenderer = await recording((base) => ({
      ...base,
      pdf: {
        render: async () => {
          throw new Error("boom");
        },
      },
    })).generateDocument(_ctx, rest);
    expect(!brokenRenderer.ok && brokenRenderer.error.code).toBe("DOCUMENT_GENERATION_FAILED");
    const brokenStorage = await createDocuments((base) => ({
      ...base,
      storage: {
        ...base.storage,
        put: async () => {
          throw new Error("bucket down");
        },
      },
    })).generateDocument(_ctx, rest);
    expect(!brokenStorage.ok && brokenStorage.error.code).toBe("DOCUMENT_GENERATION_FAILED");
    expect(await db().patientDocument.count()).toBe(0);
    expect(
      (await db().documentStorageUsage.findUnique({ where: { organizationId: world.organizationId } }))
        ?.usedBytes ?? BigInt(0),
    ).toBe(BigInt(0));
    expect(stored).toEqual([]);

    // The PDF is stored, then the transaction fails (here: the usage crosses 80% and the list of
    // administrators cannot be read): the stored object is removed and no document exists.
    await db().documentStorageUsage.upsert({
      where: { organizationId: world.organizationId },
      create: { organizationId: world.organizationId, usedBytes: BigInt((QUOTA * 80) / 100 - 1) },
      update: { usedBytes: BigInt((QUOTA * 80) / 100 - 1) },
    });
    const rejectedByDatabase = await recording((base) => ({
      ...base,
      directory: {
        ...base.directory,
        administrators: async () => {
          throw new Error("directory down");
        },
      },
    })).generateDocument(_ctx, rest);
    expect(!rejectedByDatabase.ok && rejectedByDatabase.error.code).toBe("DOCUMENT_GENERATION_FAILED");
    expect(await db().patientDocument.count()).toBe(0);
    expect(stored).toHaveLength(1);
    expect(deleted).toEqual(stored);
    expect(await objectStorage().head(stored[0] ?? "")).toBeNull();
    const usage = await db().documentStorageUsage.findUniqueOrThrow({
      where: { organizationId: world.organizationId },
    });
    expect(Number(usage.usedBytes)).toBe((QUOTA * 80) / 100 - 1);
  });
});

describe("data of other features in generated documents", () => {
  async function capture(
    ctx: DocumentsWorld["pro"],
    templateId: string,
    fields: Record<string, string> = {},
  ) {
    let received: DocumentPdfInput | null = null;
    const spy = createDocuments((base) => ({
      ...base,
      pdf: {
        render: async (pdf) => {
          received = pdf;
          return base.pdf.render(pdf);
        },
      },
    }));
    const result = await spy.generateDocument(ctx, {
      patientId: world.patients.maria,
      templateId,
      professionalId: world.professionals.ana,
      unitId: world.unitId,
      fields,
      confirmMissing: true,
    });
    if (!result.ok) throw new Error(`generate failed: ${result.error.code}`);
    return received as DocumentPdfInput | null;
  }

  async function unitContact() {
    const contact = await units.getUnitContact(world.pro, world.unitId);
    if (!contact.ok) throw new Error("unit contact failed");
    return contact.value;
  }

  it("F01 → F08: the organization name and tax ID appear in generated documents", async () => {
    await db().organization.update({
      where: { id: world.organizationId },
      data: { tradeName: "Clínica Aurora", taxId: "11222333000181" },
    });
    const created = await documents.createTemplate(world.manager, {
      name: "Cabeçalho",
      type: "OTHER",
      clinical: false,
      bodyHtml: "<p>{{clinica.nome}} — {{clinica.cnpj}}</p>",
    });
    if (!created.ok) throw new Error("create failed");
    const pdf = await capture(world.pro, created.value.templateId);
    expect(pdf?.clinicName).toBe("Clínica Aurora");
    expect(pdf?.bodyHtml).toBe("<p>Clínica Aurora — 11.222.333/0001-81</p>");
  });

  it("F02 → F08: unit name, address and phone are substituted into templates and the footer", async () => {
    const created = await documents.createTemplate(world.manager, {
      name: "Unidade",
      type: "OTHER",
      clinical: false,
      bodyHtml: "<p>{{unidade.nome}} | {{unidade.endereco}}</p>",
    });
    if (!created.ok) throw new Error("create failed");
    const unit = await unitContact();
    const pdf = await capture(world.pro, created.value.templateId);
    expect(unit.formattedAddress).not.toBe("");
    expect(pdf?.bodyHtml).toBe(`<p>${unit.name} | ${unit.formattedAddress}</p>`.replace(/&/g, "&amp;"));
    expect(pdf?.footerNote).toContain(unit.formattedAddress);
    if (unit.phone) expect(pdf?.footerNote).toContain(unit.phone);
  });

  it("F04 → F08: professional name and council registration are substituted into generated documents", async () => {
    const created = await documents.createTemplate(world.manager, {
      name: "Assinatura",
      type: "OTHER",
      clinical: false,
      bodyHtml: "<p>{{profissional.nome}} / {{profissional.registro}}</p>",
    });
    if (!created.ok) throw new Error("create failed");
    const pdf = await capture(world.pro, created.value.templateId);
    expect(pdf?.signature.name).toBe("Dra. Ana");
    expect(pdf?.signature.registration).toMatch(/^CRM 111111\/SP$/);
    expect(pdf?.bodyHtml).toBe("<p>Dra. Ana / CRM 111111/SP</p>");
  });

  it("F05 → F08: the patient's social name takes precedence in generated documents", async () => {
    const created = await documents.createTemplate(world.manager, {
      name: "Nome",
      type: "OTHER",
      clinical: false,
      bodyHtml: "<p>{{paciente.nome}}</p>",
    });
    if (!created.ok) throw new Error("create failed");
    const pdf = await capture(world.pro, created.value.templateId);
    expect(pdf?.bodyHtml).toBe("<p>Mari Oliveira</p>");
  });

  it("F16 → F08: generated documents use the language chosen by the user", async () => {
    const created = await documents.createTemplate(world.manager, {
      name: "Data",
      type: "OTHER",
      clinical: false,
      bodyHtml: "<p>{{data_extenso}}</p>",
    });
    if (!created.ok) throw new Error("create failed");
    const english = { ...world.pro, locale: "en" as const };
    const pdf = await capture(english, created.value.templateId);
    const unit = await db().unit.findUniqueOrThrow({ where: { id: world.unitId } });
    const today = dateInTimeZone(new Date(), unit.timeZone);
    expect(pdf?.bodyHtml).toBe(`<p>${formatLongDate(today, "en")}</p>`);
    expect(pdf?.pageLabel).toBe("Page {page} of {total}");
    const spanish = await capture({ ...world.pro, locale: "es" as const }, created.value.templateId);
    expect(spanish?.pageLabel).toBe("Página {page} de {total}");
    expect(spanish?.bodyHtml).toBe(`<p>${formatLongDate(today, "es")}</p>`);
  });
});
