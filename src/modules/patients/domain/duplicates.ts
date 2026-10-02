import { normalizeName } from "./names";

// PRD F05 duplicate warning (Specification, architecture 11.2): the same normalized full name and
// birth date. The use case queries by these keys; this rule states what "the same person" means.
export type IdentityKey = { fullName: string; birthDate: string };

export function sameIdentity(a: IdentityKey, b: IdentityKey): boolean {
  return normalizeName(a.fullName) === normalizeName(b.fullName) && a.birthDate === b.birthDate;
}
