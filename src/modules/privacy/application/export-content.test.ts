import { describe, expect, it } from "vitest";
import type { Translator } from "@/shared/i18n/translator";
import {
  archiveEntries,
  buildExportJson,
  buildExportPdfModel,
  entryName,
  exportFiles,
} from "./export-content";
import type { PatientExportData } from "./ports";

const at = (iso: string) => new Date(iso);

// A translator that returns the key with its parameters, so the test does not depend on the catalogs.
const t = Object.assign(
  (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  {
    has: () => true,
  },
) as Translator;

const DATA: PatientExportData = {
  organization: { id: "org", name: "Clínica Exemplo", timeZone: "America/Sao_Paulo", logoKey: null },
  patient: {
    id: "patient-1",
    fullName: "Bruna Teixeira",
    socialName: null,
    birthDate: "1990-05-04",
    sex: "FEMALE",
    document: { country: "BR", type: "CPF", number: "52998224725" },
    rg: "12345678",
    mobilePhone: "+5511988887777",
    secondaryPhone: null,
    email: "bruna@exemplo.com.br",
    address: {
      country: "BR",
      postalCode: "01310100",
      street: "Avenida Paulista",
      number: "1000",
      complement: null,
      district: null,
      city: "São Paulo",
      region: "SP",
    },
    occupation: null,
    referralSource: null,
    observations: null,
    tags: ["VIP"],
    guardian: null,
    active: true,
    inactiveReason: null,
    createdAt: at("2026-01-10T12:00:00Z"),
    anonymizedAt: null,
  },
  consents: [
    {
      id: "consent-1",
      consentedAt: at("2026-01-10T12:05:00Z"),
      termsVersion: 1,
      method: "PAPER_UPLOADED",
      recordedByName: "Recepção",
      file: { id: "consent-1", fileName: "termo assinado.pdf", objectKey: "org/x/patients/c1" },
    },
  ],
  appointments: [
    {
      id: "appointment-1",
      startsAt: at("2026-02-01T13:00:00Z"),
      endsAt: at("2026-02-01T13:50:00Z"),
      timeZone: "America/Sao_Paulo",
      status: "COMPLETED",
      serviceName: "Consulta",
      professionalName: "Dra. Helena",
      unitName: "Unidade Centro",
      roomName: "Sala 1",
      isOverbooking: false,
      priceMinor: "25000",
      currency: "BRL",
      notes: null,
      cancellation: null,
      createdAt: at("2026-01-20T12:00:00Z"),
      createdByName: "Recepção",
      history: [
        {
          fromStatus: null,
          toStatus: "SCHEDULED",
          changedAt: at("2026-01-20T12:00:00Z"),
          changedByName: "Recepção",
          justification: null,
        },
      ],
      reschedules: [],
    },
  ],
  clinicalNotes: [
    {
      id: "note-1",
      kind: "ENCOUNTER",
      status: "FINALIZED",
      appointmentId: "appointment-1",
      professionalName: "Dra. Helena",
      authorName: "Helena Souza",
      createdAt: at("2026-02-01T13:40:00Z"),
      finalizedAt: at("2026-02-01T13:45:00Z"),
      autoFinalized: false,
      contentHtml: "<p>Evolução.</p>",
      contentText: "Evolução.",
      versions: [],
      addenda: [],
      attachments: [
        {
          id: "attachment-1",
          fileName: "raio-x.jpg",
          contentType: "image/jpeg",
          sizeBytes: 2000,
          inError: false,
          createdAt: at("2026-02-01T13:42:00Z"),
          file: { id: "attachment-1", fileName: "raio-x.jpg", objectKey: "org/x/clinical/a1" },
        },
      ],
    },
  ],
  clinicalAlert: null,
  documents: [
    {
      id: "document-1",
      kind: "UPLOADED",
      title: "RG digitalizado",
      categoryName: "Documento pessoal",
      isClinical: false,
      status: "READY",
      fileName: "../../etc/rg ção.pdf",
      contentType: "application/pdf",
      sizeBytes: 1000,
      createdAt: at("2026-01-11T12:00:00Z"),
      authorName: "Recepção",
      archivedAt: null,
      erasedAt: null,
      file: { id: "document-1", fileName: "../../etc/rg ção.pdf", objectKey: "org/x/documents/d1" },
    },
  ],
  charges: [
    {
      id: "charge-1",
      number: "2026-000001",
      origin: "APPOINTMENT",
      item: "Consulta",
      unitName: "Unidade Centro",
      timeZone: "America/Sao_Paulo",
      currency: "BRL",
      grossMinor: "25000",
      discountMinor: "0",
      discountReason: null,
      netMinor: "25000",
      paidMinor: "25000",
      status: "PAID",
      createdAt: at("2026-02-01T13:00:00Z"),
      cancelledAt: null,
      cancelReason: null,
      payments: [
        {
          id: "payment-1",
          kind: "PAYMENT",
          method: "PIX",
          installments: null,
          amountMinor: "25000",
          refundedMinor: "0",
          receivedAt: at("2026-02-01T13:55:00Z"),
          userName: "Recepção",
          reason: null,
        },
      ],
    },
  ],
};

const REQUEST = {
  id: "01927a52-0000-7000-8000-0000007f3a2c",
  requestedBy: "PATIENT",
  reason: "Paciente pediu cópia.",
};

describe("export content", () => {
  it("F14: the export JSON has every section and money as minor-unit strings", () => {
    const json = buildExportJson({
      data: DATA,
      request: REQUEST,
      locale: "pt-BR",
      generatedAt: at("2026-10-18T13:00:00Z"),
      t,
    });
    expect(Object.keys(json)).toEqual(
      expect.arrayContaining([
        "schemaVersion",
        "patient",
        "consents",
        "appointments",
        "clinicalNotes",
        "clinicalAlert",
        "documents",
        "charges",
        "packages",
        "files",
      ]),
    );
    expect(json.schemaVersion).toBe(1);
    expect(json.patient.document).toEqual({ country: "BR", type: "CPF", number: "52998224725" });
    expect(json.appointments[0]?.price).toEqual({ amountMinor: "25000", currency: "BRL" });
    expect(json.charges[0]).toMatchObject({ netMinor: "25000", paidMinor: "25000", currency: "BRL" });
    expect(json.charges[0]?.payments[0]?.amountMinor).toBe("25000");
    expect(json.clinicalNotes[0]?.contentText).toBe("Evolução.");
    expect(json.packages).toBeNull();
    expect(json.request).toEqual(REQUEST);
    // Every stored file is listed with its path in the ZIP.
    expect(json.files.map((file) => file.path)).toEqual([
      "arquivos/documentos/document-1-etc_rg_cao.pdf",
      "arquivos/anexos-clinicos/attachment-1-raio-x.jpg",
      "arquivos/consentimentos/consent-1-termo_assinado.pdf",
    ]);
    expect(json.documents[0]?.file).toBe("arquivos/documentos/document-1-etc_rg_cao.pdf");
  });

  it("F14: ZIP entry names never leave their folder", () => {
    expect(entryName("arquivos/documentos", { id: "d", fileName: "../../x/../y.pdf", objectKey: "k" })).toBe(
      "arquivos/documentos/d-x_y.pdf",
    );
    expect(entryName("arquivos/documentos", { id: "d", fileName: "...", objectKey: "k" })).toBe(
      "arquivos/documentos/d-arquivo",
    );
  });

  it("F14: the ZIP holds the JSON and the PDF first, then every stored file", () => {
    const entries = archiveEntries({ json: { a: 1 }, pdf: new Uint8Array([1, 2]), files: exportFiles(DATA) });
    expect(entries.map((entry) => entry.name)).toEqual([
      "dados.json",
      "resumo.pdf",
      "arquivos/documentos/document-1-etc_rg_cao.pdf",
      "arquivos/anexos-clinicos/attachment-1-raio-x.jpg",
      "arquivos/consentimentos/consent-1-termo_assinado.pdf",
    ]);
    expect(entries[0]).toMatchObject({ kind: "content", compress: true });
    expect(entries[2]).toMatchObject({ kind: "object", objectKey: "org/x/documents/d1" });
  });

  it("F14: the PDF summary has one section per kind of data, with note texts", () => {
    const model = buildExportPdfModel({
      data: DATA,
      request: REQUEST,
      locale: "pt-BR",
      generatedAt: at("2026-10-18T13:00:00Z"),
      t,
      logo: null,
    });
    expect(model.sections.map((section) => section.title)).toEqual([
      "privacy.pdf.sections.patient",
      "privacy.pdf.sections.consents",
      "privacy.pdf.sections.appointments",
      "privacy.pdf.sections.clinicalNotes",
      "privacy.pdf.sections.documents",
      "privacy.pdf.sections.charges",
    ]);
    const patient = model.sections[0]?.pairs ?? [];
    expect(patient.find((pair) => pair.label === "privacy.pdf.fields.document")?.value).toBe(
      "CPF 529.982.247-25",
    );
    expect(model.sections[3]?.texts?.[0]?.body).toContain("Evolução.");
    expect(model.sections[5]?.table?.rows[0]?.[3]).toBe("R$ 250,00");
    expect(model.subtitle).toContain("7f3a2c");
  });
});
