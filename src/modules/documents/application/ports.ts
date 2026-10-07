import type { RequestContext } from "@/shared/context/types";
import type { Locale } from "@/shared/i18n/locales";
import type { CountryCode } from "@/shared/kernel/countries/codes";
import type { FileReader } from "@/shared/kernel/file-types";
import type { Result } from "@/shared/kernel/result";

// Ports of the documents module (architecture 11.1: dependency inversion for external services
// and for the data of other modules; Prisma is used directly, as in every simple module).

export interface DocumentStorage {
  // Presigned PUT for the browser, with the content type and size signed (ADR-031).
  presignUpload(key: string, contentType: string, size: number): Promise<string>;
  // Presigned GET valid for 5 minutes (PRD F08, ADR-009).
  presignDownload(key: string, options: { contentDisposition?: string }): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
  // Reads slices of a stored object, to check its real type (ADR-033).
  reader(key: string, size: number): FileReader;
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ImageProcessor {
  heicToJpeg(input: Uint8Array): Promise<Uint8Array>;
}

export interface HtmlSanitizer {
  sanitize(html: string): { html: string; text: string };
}

// What the generated PDF is made of. Texts are already in the language of the user who generates it.
export type DocumentPdfInput = {
  documentTitle: string;
  clinicName: string;
  logo: { data: Buffer; format: "png" | "jpg" } | null;
  title: string;
  // Resolved body: the sanitized HTML of the template with the values substituted.
  bodyHtml: string;
  signature: { name: string; registration: string | null; line: string };
  footerNote: string;
  pageLabel: string;
};

export interface DocumentPdfRenderer {
  render(input: DocumentPdfInput): Promise<Buffer>;
}

export type PatientForDocument = {
  id: string;
  displayName: string;
  // YYYY-MM-DD.
  birthDate: string;
  document: { type: string; number: string } | null;
  formattedAddress: string;
};

export type OrganizationForDocument = {
  // Trade name, else legal name.
  name: string;
  taxId: string | null;
  country: CountryCode;
  defaultLocale: Locale;
  timeZone: string;
  logo: { data: Buffer; format: "png" | "jpg" } | null;
};

export type UnitForDocument = {
  id: string;
  name: string;
  active: boolean;
  country: CountryCode;
  timeZone: string;
  phone: string | null;
  formattedAddress: string;
};

export type ProfessionalForDocument = {
  id: string;
  displayName: string;
  specialty: string | null;
  // "CRM 123456/SP" for the country of the unit, else null.
  registration: string | null;
};

export type ProfessionalOption = { id: string; displayName: string; active: boolean };

// The data of other modules, read through their public APIs (PRD F08 Consumes).
export interface DocumentsDirectory {
  // Applies the F05 visibility policy: a forbidden or missing patient comes back as a failure.
  patient(ctx: RequestContext, patientId: string): Promise<Result<PatientForDocument>>;
  // The F07 records policy: a linked professional with an appointment with the patient.
  canAccessClinical(ctx: RequestContext, patientId: string): Promise<boolean>;
  organization(ctx: RequestContext): Promise<OrganizationForDocument>;
  unit(ctx: RequestContext, unitId: string): Promise<UnitForDocument | null>;
  units(ctx: RequestContext): Promise<UnitForDocument[]>;
  selectedUnitId(ctx: RequestContext): Promise<string | null>;
  professional(
    ctx: RequestContext,
    professionalId: string,
    country: CountryCode,
  ): Promise<ProfessionalForDocument | null>;
  professionals(ctx: RequestContext): Promise<ProfessionalOption[]>;
  userNames(ctx: RequestContext, userIds: string[]): Promise<Map<string, string>>;
  administrators(ctx: RequestContext): Promise<{ name: string; email: string; locale: Locale }[]>;
}

export type DocumentsDeps = {
  storage: DocumentStorage;
  images: ImageProcessor;
  sanitizer: HtmlSanitizer;
  pdf: DocumentPdfRenderer;
  directory: DocumentsDirectory;
  clock: () => Date;
};
