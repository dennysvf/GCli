import { DOCUMENT_SEARCH_MIN_LENGTH, SEARCH_MIN_LENGTH } from "./limits";
import { normalizeName } from "./names";

// PRD F05 and F16 search: by name (accent- and case-insensitive, partial), by identity document of
// any type (with or without punctuation) or by phone (matched anywhere in the national numbers),
// with at least 3 characters. Each kind uses one index.
export type SearchTerm =
  | { kind: "name"; value: string }
  // Digits only, 5 or more: a document of any type, or part of a phone.
  | { kind: "document-or-phone"; value: string }
  // Letters and digits with at least one digit and 5 characters: a document such as "12345678Z".
  | { kind: "document"; value: string }
  // 3 or 4 digits: matched anywhere in the phone digits.
  | { kind: "phone"; value: string }
  | { kind: "too-short" };

export function classifySearchTerm(text: string): SearchTerm {
  const trimmed = text.trim();
  // Spaces do not count towards the minimum.
  if (trimmed.replace(/\s/g, "").length < SEARCH_MIN_LENGTH) return { kind: "too-short" };
  // Only digits and the document or phone punctuation.
  if (/^[\d\s.\-()/+]+$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length >= DOCUMENT_SEARCH_MIN_LENGTH) return { kind: "document-or-phone", value: digits };
    if (digits.length < SEARCH_MIN_LENGTH) return { kind: "too-short" };
    return { kind: "phone", value: digits };
  }
  // Letters and digits: a document when it has at least one digit and 5 characters once the
  // punctuation is removed ("12345678-Z"); a name otherwise.
  if (/^[0-9A-Za-z\s.\-]+$/.test(trimmed) && /\d/.test(trimmed)) {
    const compact = trimmed.replace(/[\s.\-]/g, "").toUpperCase();
    if (compact.length >= DOCUMENT_SEARCH_MIN_LENGTH) return { kind: "document", value: compact };
  }
  const name = normalizeName(trimmed);
  return name.replace(/\s/g, "").length < SEARCH_MIN_LENGTH
    ? { kind: "too-short" }
    : { kind: "name", value: name };
}
