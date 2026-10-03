// Zod schemas of the personal data shared by patients, guardians, professionals and units
// (PRD F16): identity document and phone. Messages are catalog keys (ADR-028).
import { z } from "zod";
import { messageKey } from "@/shared/i18n/message-key";
import { COUNTRY_CODES, type CountryCode } from "./countries/codes";
import { DOCUMENT_SPECS, DOCUMENT_TYPES, normalizeDocument, type DocumentType } from "./documents";
import { PhoneNumber } from "./phone";

export type DocumentValue = { country: CountryCode; type: DocumentType; number: string };

// An identity document: country, type and number. An empty number means "no document".
export const documentInputSchema = z
  .object({
    country: z.enum(COUNTRY_CODES, { error: "validation.countryInvalid" }),
    type: z.enum(DOCUMENT_TYPES, { error: "validation.documentTypeInvalid" }),
    number: z.string().trim(),
  })
  .nullish()
  .transform((value, ctx): DocumentValue | null => {
    if (!value || value.number === "") return null;
    const spec = DOCUMENT_SPECS[value.type];
    if (spec.country !== value.country) {
      ctx.addIssue({ code: "custom", path: ["type"], message: "validation.documentTypeInvalid" });
      return null;
    }
    const number = normalizeDocument(value.type, value.number);
    if (!spec.validate(number)) {
      ctx.addIssue({
        code: "custom",
        path: ["number"],
        message: messageKey("validation.documentInvalid", { type: spec.shortLabel }),
      });
      return null;
    }
    return { country: value.country, type: value.type, number };
  });

// A phone number stored as E.164. The phone input emits "+<code><digits>", so the default country
// only matters for input typed without a code.
export function phoneInputSchema(options: { mobile?: boolean; defaultCountry?: CountryCode } = {}) {
  return z
    .string()
    .trim()
    .nullish()
    .transform((value, ctx): string | null => {
      if (!value) return null;
      const parsed = PhoneNumber.parse(value, {
        defaultCountry: options.defaultCountry ?? "BR",
        ...(options.mobile ? { mobile: true } : {}),
      });
      if (parsed.ok) return parsed.value.e164;
      ctx.addIssue({
        code: "custom",
        message: options.mobile ? "validation.mobileInvalid" : "validation.phoneInvalid",
      });
      return null;
    });
}
