import { ANONYMIZATION_CODE_LENGTH } from "./limits";

// The second confirmation of the anonymization (PRD F14, spec decision D19): the typed name must be
// the patient's full name, ignoring case, accents and extra spaces (the F05 normalized form), so a
// keyboard without accents does not block while a different name still does.
export function normalizeTypedName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(typed: string, fullName: string): boolean {
  const expected = normalizeTypedName(fullName);
  return expected.length > 0 && normalizeTypedName(typed) === expected;
}

const HEX = "0123456789ABCDEF";

// Six random uppercase hexadecimal characters ("A1B2C3"). `random` returns numbers in [0, 1); the
// application passes a cryptographic source.
export function newAnonymizationCode(random: () => number): string {
  let code = "";
  for (let index = 0; index < ANONYMIZATION_CODE_LENGTH; index++) {
    code += HEX[Math.min(HEX.length - 1, Math.floor(random() * HEX.length))];
  }
  return code;
}

export function isAnonymizationCode(code: string): boolean {
  return new RegExp(`^[0-9A-F]{${ANONYMIZATION_CODE_LENGTH}}$`).test(code);
}

// PRD F14: the irreversible placeholder that replaces the name ("Paciente anonimizado #A1B2C3"). It is
// stored data, written as the PRD defines it; screens show it as any other patient name.
export function placeholderName(code: string): string {
  return `Paciente anonimizado #${code}`;
}
