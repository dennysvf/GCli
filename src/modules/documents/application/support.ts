import type { RequestContext } from "@/shared/context/types";
import type { UnitOfWork } from "@/shared/db/transaction";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/shared/i18n/locales";

// Helpers shared by the use cases of the documents module.

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === "P2002";
}

// The clinical flag trigger of migration 0010 raises P0001 with this message.
export function isClinicalFlagViolation(error: unknown): boolean {
  return String((error as { message?: string }).message ?? "").includes("DOCUMENT_CLINICAL_FLAG_LOCKED");
}

// The default language of the organization: default categories and templates are created in it
// (PRD F16) and are clinic data from then on.
export async function organizationLocale(uow: UnitOfWork): Promise<Locale> {
  const organization = await uow.tx.organization.findFirst({ select: { defaultLocale: true } });
  return isLocale(organization?.defaultLocale) ? organization.defaultLocale : DEFAULT_LOCALE;
}

export function actorOf(ctx: RequestContext) {
  return { userId: ctx.user.id, organizationId: ctx.organizationId };
}

// Content-Disposition with the original name: an ASCII fallback for old clients and the UTF-8 form
// (RFC 6266) for the real name, which may carry accents.
export function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
