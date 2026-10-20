import { formatDate, formatDateTime, formatLocale, formatMoney } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/locales";
import type { Translator } from "@/shared/i18n/translator";
import { formatCountryAddress } from "@/shared/kernel/address";
import { isCountryCode, isCurrency } from "@/shared/kernel/countries/codes";
import { DOCUMENT_TYPES, formatDocument, type DocumentType } from "@/shared/kernel/documents";
import { formatPhoneNumber } from "@/shared/kernel/phone";
import type { ArchiveEntry, ExportFile, ExportPdfModel, PatientExportData } from "./ports";

// What an LGPD export contains (PRD F14, spec decision D20): dados.json with every section of the
// patient's data (F05–F09), resumo.pdf with the same data as readable sections, and the stored files
// under arquivos/. The JSON keys are stable identifiers; the texts follow the requester's language.

export const EXPORT_SCHEMA_VERSION = 1;

export const ZIP_PATHS = {
  json: "dados.json",
  pdf: "resumo.pdf",
  documents: "arquivos/documentos",
  attachments: "arquivos/anexos-clinicos",
  consents: "arquivos/consentimentos",
} as const;

export type ExportRequestInfo = { id: string; requestedBy: string; reason: string };

// A safe ZIP entry name: the row id keeps names unique, the file name is reduced to plain characters
// (no folders, no control characters) and shortened.
export function entryName(folder: string, file: ExportFile): string {
  const base = file.fileName
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/[._]{2,}/g, "_")
    .replace(/^[._]+/, "")
    .slice(-100);
  return `${folder}/${file.id}-${base || "arquivo"}`;
}

export type ExportFileEntry = { path: string; objectKey: string; section: string; id: string };

// Every stored file of the patient, with its place in the ZIP.
export function exportFiles(data: PatientExportData): ExportFileEntry[] {
  const files: ExportFileEntry[] = [];
  for (const document of data.documents) {
    if (document.file) {
      files.push({
        path: entryName(ZIP_PATHS.documents, document.file),
        objectKey: document.file.objectKey,
        section: "documents",
        id: document.id,
      });
    }
  }
  for (const note of data.clinicalNotes) {
    for (const attachment of note.attachments) {
      files.push({
        path: entryName(ZIP_PATHS.attachments, attachment.file),
        objectKey: attachment.file.objectKey,
        section: "clinicalAttachments",
        id: attachment.id,
      });
    }
  }
  for (const consent of data.consents) {
    if (consent.file) {
      files.push({
        path: entryName(ZIP_PATHS.consents, consent.file),
        objectKey: consent.file.objectKey,
        section: "consents",
        id: consent.id,
      });
    }
  }
  return files;
}

const iso = (value: Date | null) => (value ? value.toISOString() : null);

// dados.json (schemaVersion 1). Money stays in integer minor units as text, with its currency
// (ADR-029), so no amount is ever rounded by a JSON reader.
export function buildExportJson(input: {
  data: PatientExportData;
  request: ExportRequestInfo;
  locale: Locale;
  generatedAt: Date;
  t: Translator;
}) {
  const { data, request, locale, generatedAt, t } = input;
  const files = exportFiles(data);
  const pathOf = (id: string) => files.find((file) => file.id === id)?.path ?? null;
  const patient = data.patient;
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    about: t("privacy.json.about"),
    locale,
    generatedAt: generatedAt.toISOString(),
    organization: { name: data.organization.name, timeZone: data.organization.timeZone },
    request: { id: request.id, requestedBy: request.requestedBy, reason: request.reason },
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      socialName: patient.socialName,
      birthDate: patient.birthDate,
      sex: patient.sex,
      document: patient.document,
      rg: patient.rg,
      mobilePhone: patient.mobilePhone || null,
      secondaryPhone: patient.secondaryPhone,
      email: patient.email,
      address: patient.address,
      occupation: patient.occupation,
      referralSource: patient.referralSource,
      observations: patient.observations,
      tags: patient.tags,
      guardian: patient.guardian,
      active: patient.active,
      inactiveReason: patient.inactiveReason,
      createdAt: patient.createdAt.toISOString(),
      anonymizedAt: iso(patient.anonymizedAt),
    },
    consents: data.consents.map((consent) => ({
      id: consent.id,
      consentedAt: consent.consentedAt.toISOString(),
      termsVersion: consent.termsVersion,
      method: consent.method,
      recordedBy: consent.recordedByName,
      fileName: consent.file?.fileName ?? null,
      file: pathOf(consent.id),
    })),
    appointments: data.appointments.map((appointment) => ({
      id: appointment.id,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      timeZone: appointment.timeZone,
      status: appointment.status,
      service: appointment.serviceName,
      professional: appointment.professionalName,
      unit: appointment.unitName,
      room: appointment.roomName,
      isOverbooking: appointment.isOverbooking,
      price: { amountMinor: appointment.priceMinor, currency: appointment.currency },
      notes: appointment.notes,
      cancellation: appointment.cancellation
        ? { ...appointment.cancellation, at: iso(appointment.cancellation.at) }
        : null,
      createdAt: appointment.createdAt.toISOString(),
      createdBy: appointment.createdByName,
      statusHistory: appointment.history.map((line) => ({
        from: line.fromStatus,
        to: line.toStatus,
        changedAt: line.changedAt.toISOString(),
        changedBy: line.changedByName,
        justification: line.justification,
      })),
      reschedules: appointment.reschedules.map((line) => ({
        previousStartsAt: line.previousStartsAt.toISOString(),
        previousEndsAt: line.previousEndsAt.toISOString(),
        rescheduledAt: line.rescheduledAt.toISOString(),
        rescheduledBy: line.rescheduledByName,
      })),
    })),
    clinicalNotes: data.clinicalNotes.map((note) => ({
      id: note.id,
      kind: note.kind,
      status: note.status,
      appointmentId: note.appointmentId,
      professional: note.professionalName,
      author: note.authorName,
      createdAt: note.createdAt.toISOString(),
      finalizedAt: iso(note.finalizedAt),
      autoFinalized: note.autoFinalized,
      contentHtml: note.contentHtml,
      contentText: note.contentText,
      versions: note.versions.map((version) => ({
        versionNumber: version.versionNumber,
        replacedAt: version.replacedAt.toISOString(),
        contentHtml: version.contentHtml,
        contentText: version.contentText,
      })),
      addenda: note.addenda.map((addendum) => ({
        id: addendum.id,
        author: addendum.authorName,
        createdAt: addendum.createdAt.toISOString(),
        contentHtml: addendum.contentHtml,
        contentText: addendum.contentText,
      })),
      attachments: note.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        markedInError: attachment.inError,
        createdAt: attachment.createdAt.toISOString(),
        file: pathOf(attachment.id),
      })),
    })),
    clinicalAlert: data.clinicalAlert
      ? {
          text: data.clinicalAlert.text,
          updatedAt: data.clinicalAlert.updatedAt.toISOString(),
          history: data.clinicalAlert.history.map((line) => ({
            previousText: line.previousText,
            changedAt: line.changedAt.toISOString(),
          })),
        }
      : null,
    documents: data.documents.map((document) => ({
      id: document.id,
      kind: document.kind,
      title: document.title,
      category: document.categoryName,
      clinical: document.isClinical,
      status: document.status,
      fileName: document.fileName,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      createdAt: document.createdAt.toISOString(),
      author: document.authorName,
      archivedAt: iso(document.archivedAt),
      erasedAt: iso(document.erasedAt),
      file: pathOf(document.id),
    })),
    charges: data.charges.map((charge) => ({
      id: charge.id,
      number: charge.number,
      origin: charge.origin,
      item: charge.item,
      unit: charge.unitName,
      currency: charge.currency,
      grossMinor: charge.grossMinor,
      discountMinor: charge.discountMinor,
      discountReason: charge.discountReason,
      netMinor: charge.netMinor,
      paidMinor: charge.paidMinor,
      status: charge.status,
      createdAt: charge.createdAt.toISOString(),
      cancelledAt: iso(charge.cancelledAt),
      cancelReason: charge.cancelReason,
      payments: charge.payments.map((payment) => ({
        id: payment.id,
        kind: payment.kind,
        method: payment.method,
        installments: payment.installments,
        amountMinor: payment.amountMinor,
        refundedMinor: payment.refundedMinor,
        receivedAt: payment.receivedAt.toISOString(),
        user: payment.userName,
        reason: payment.reason,
      })),
    })),
    // Session packages (F10) are outside F14's dependency closure; the key is reserved.
    packages: null,
    files: files.map((file) => ({ path: file.path, section: file.section, id: file.id })),
  };
}

const NONE = "—";

function documentText(document: { type: string; number: string } | null): string {
  if (!document) return NONE;
  const type = (DOCUMENT_TYPES as readonly string[]).includes(document.type)
    ? (document.type as DocumentType)
    : null;
  return type
    ? `${document.type} ${formatDocument(type, document.number)}`
    : `${document.type} ${document.number}`;
}

function phoneText(phone: string | null): string {
  return phone ? formatPhoneNumber(phone) : NONE;
}

// resumo.pdf: the same data as readable sections, in the requester's language, with note texts.
export function buildExportPdfModel(input: {
  data: PatientExportData;
  request: ExportRequestInfo;
  locale: Locale;
  generatedAt: Date;
  t: Translator;
  logo: ExportPdfModel["logo"];
}): ExportPdfModel {
  const { data, request, generatedAt, t } = input;
  const intl = formatLocale(input.locale, null);
  const zone = data.organization.timeZone;
  const dateTime = (value: Date, timeZone = zone) => formatDateTime(value, intl, timeZone);
  const money = (amountMinor: string, currency: string) =>
    isCurrency(currency)
      ? formatMoney({ amountMinor: BigInt(amountMinor), currency }, intl)
      : `${currency} ${amountMinor}`;
  const patient = data.patient;
  const address =
    patient.address.country && isCountryCode(patient.address.country)
      ? formatCountryAddress({ ...patient.address, country: patient.address.country }) || NONE
      : NONE;
  const generated = dateTime(generatedAt);
  const shortRequest = request.id.slice(-6);
  const field = (key: string) => t(`privacy.pdf.fields.${key}`);

  const sections: ExportPdfModel["sections"] = [
    {
      title: t("privacy.pdf.sections.patient"),
      pairs: [
        { label: field("fullName"), value: patient.fullName },
        { label: field("socialName"), value: patient.socialName ?? NONE },
        { label: field("birthDate"), value: formatDate(patient.birthDate, intl) },
        { label: field("sex"), value: t(`patients.ui.sexes.${patient.sex}`) },
        { label: field("document"), value: documentText(patient.document) },
        { label: field("rg"), value: patient.rg ?? NONE },
        { label: field("mobilePhone"), value: phoneText(patient.mobilePhone || null) },
        { label: field("secondaryPhone"), value: phoneText(patient.secondaryPhone) },
        { label: field("email"), value: patient.email ?? NONE },
        { label: field("address"), value: address },
        { label: field("occupation"), value: patient.occupation ?? NONE },
        { label: field("referralSource"), value: patient.referralSource ?? NONE },
        { label: field("observations"), value: patient.observations ?? NONE },
        { label: field("tags"), value: patient.tags.length ? patient.tags.join(", ") : NONE },
        { label: field("createdAt"), value: dateTime(patient.createdAt) },
      ],
    },
  ];
  if (patient.guardian) {
    sections.push({
      title: t("privacy.pdf.sections.guardian"),
      pairs: [
        { label: field("name"), value: patient.guardian.name },
        {
          label: field("relationship"),
          value: t(`patients.ui.relationships.${patient.guardian.relationship}`),
        },
        { label: field("document"), value: documentText(patient.guardian.document) },
        { label: field("phone"), value: phoneText(patient.guardian.phone) },
      ],
    });
  }
  sections.push({
    title: t("privacy.pdf.sections.consents"),
    empty: t("privacy.pdf.none"),
    table: {
      columns: [
        { label: field("date"), width: "25%" },
        { label: field("version"), width: "15%" },
        { label: field("method"), width: "35%" },
        { label: field("file"), width: "25%" },
      ],
      rows: data.consents.map((consent) => [
        dateTime(consent.consentedAt),
        String(consent.termsVersion),
        t(`patients.ui.consentMethods.${consent.method}`),
        consent.file?.fileName ?? NONE,
      ]),
    },
  });
  sections.push({
    title: t("privacy.pdf.sections.appointments"),
    empty: t("privacy.pdf.none"),
    table: {
      columns: [
        { label: field("date"), width: "18%" },
        { label: field("service"), width: "18%" },
        { label: field("professional"), width: "18%" },
        { label: field("unit"), width: "16%" },
        { label: field("status"), width: "14%" },
        { label: field("notes"), width: "16%" },
      ],
      rows: data.appointments.map((appointment) => [
        dateTime(appointment.startsAt, appointment.timeZone),
        appointment.serviceName,
        appointment.professionalName,
        appointment.unitName,
        t(`scheduling.ui.status.${appointment.status}`),
        appointment.notes ?? NONE,
      ]),
    },
  });
  sections.push({
    title: t("privacy.pdf.sections.clinicalNotes"),
    empty: t("privacy.pdf.none"),
    texts: data.clinicalNotes.map((note) => ({
      heading: `${note.professionalName} · ${dateTime(note.finalizedAt ?? note.createdAt)}`,
      body: [
        note.contentText,
        ...note.addenda.map(
          (addendum) =>
            `${t("privacy.pdf.fields.addendum", {
              author: addendum.authorName ?? NONE,
              dateTime: dateTime(addendum.createdAt),
            })}\n${addendum.contentText}`,
        ),
        ...(note.attachments.length
          ? [
              t("privacy.pdf.fields.attachments", {
                names: note.attachments.map((item) => item.fileName).join(", "),
              }),
            ]
          : []),
      ].join("\n\n"),
    })),
  });
  if (data.clinicalAlert?.text.trim()) {
    sections.push({
      title: t("privacy.pdf.sections.clinicalAlert"),
      texts: [{ heading: dateTime(data.clinicalAlert.updatedAt), body: data.clinicalAlert.text }],
    });
  }
  sections.push({
    title: t("privacy.pdf.sections.documents"),
    empty: t("privacy.pdf.none"),
    table: {
      columns: [
        { label: field("date"), width: "20%" },
        { label: field("title"), width: "35%" },
        { label: field("category"), width: "25%" },
        { label: field("kind"), width: "20%" },
      ],
      rows: data.documents.map((document) => [
        dateTime(document.createdAt),
        document.erasedAt ? t("privacy.ui.erasedDocument") : document.title,
        document.categoryName,
        t(`privacy.pdf.documentKinds.${document.kind}`),
      ]),
    },
  });
  sections.push({
    title: t("privacy.pdf.sections.charges"),
    empty: t("privacy.pdf.none"),
    table: {
      columns: [
        { label: field("number"), width: "14%" },
        { label: field("date"), width: "18%" },
        { label: field("item"), width: "22%" },
        { label: field("net"), width: "14%" },
        { label: field("status"), width: "14%" },
        { label: field("payments"), width: "18%" },
      ],
      rows: data.charges.map((charge) => [
        charge.number,
        dateTime(charge.createdAt, charge.timeZone),
        charge.item ?? NONE,
        money(charge.netMinor, charge.currency),
        t(`billing.status.${charge.status}`),
        charge.payments
          .map(
            (payment) =>
              `${t(`privacy.pdf.paymentKinds.${payment.kind}`)} ${t(`countries.paymentMethods.${payment.method}`)} ${money(payment.amountMinor, charge.currency)}`,
          )
          .join("; ") || NONE,
      ]),
    },
  });

  return {
    documentTitle: t("privacy.pdf.documentTitle"),
    clinicName: data.organization.name,
    logo: input.logo,
    title: t("privacy.pdf.title"),
    subtitle: t("privacy.pdf.subtitle", { request: shortRequest, dateTime: generated }),
    footer: t("privacy.pdf.footer", { dateTime: generated }),
    // The PDF base replaces {page} and {total} on each page.
    pageLabel: t("privacy.pdf.page", { page: "{page}", total: "{total}" }),
    sections,
  };
}

// The generated files of the ZIP (compressed) followed by every stored file (stored as they are).
export function archiveEntries(input: {
  json: unknown;
  pdf: Uint8Array;
  files: ExportFileEntry[];
}): ArchiveEntry[] {
  return [
    {
      name: ZIP_PATHS.json,
      kind: "content",
      body: new TextEncoder().encode(JSON.stringify(input.json, null, 2)),
      compress: true,
    },
    { name: ZIP_PATHS.pdf, kind: "content", body: input.pdf, compress: true },
    ...input.files.map((file): ArchiveEntry => ({
      name: file.path,
      kind: "object",
      objectKey: file.objectKey,
    })),
  ];
}
