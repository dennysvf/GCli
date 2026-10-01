import { PHONE_SEARCH_MIN_DIGITS, SEARCH_MIN_LENGTH } from "./limits";
import { normalizeName } from "./names";

// PRD F05 search: by name (accent- and case-insensitive, partial), CPF (with or without mask) or
// phone (last 8+ digits), with at least 3 characters. Each kind uses one index.
export type SearchTerm =
  | { kind: "name"; value: string }
  | { kind: "cpf-or-phone"; value: string }
  | { kind: "phone"; value: string }
  | { kind: "too-short" };

export function classifySearchTerm(text: string): SearchTerm {
  const trimmed = text.trim();
  // Spaces do not count towards the minimum.
  if (trimmed.replace(/\s/g, "").length < SEARCH_MIN_LENGTH) return { kind: "too-short" };
  // Only digits and the CPF/phone punctuation: a document or a phone.
  if (/^[\d\s.\-()/]+$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length === 11) return { kind: "cpf-or-phone", value: digits };
    if (digits.length >= PHONE_SEARCH_MIN_DIGITS) return { kind: "phone", value: digits };
    // 3 to 7 digits: matched anywhere in the phone digits.
    if (digits.length < SEARCH_MIN_LENGTH) return { kind: "too-short" };
    return { kind: "phone", value: digits };
  }
  const name = normalizeName(trimmed);
  return name.replace(/\s/g, "").length < SEARCH_MIN_LENGTH
    ? { kind: "too-short" }
    : { kind: "name", value: name };
}
