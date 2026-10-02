// Patient names (PRD F05). The normalized form backs the accent- and case-insensitive search and
// the duplicate check; it is computed here so saving and searching use the same function.
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// PRD F05: the social name, when filled, is displayed instead of the full name.
export function displayName(fullName: string, socialName: string | null | undefined): string {
  return socialName?.trim() ? socialName.trim() : fullName;
}

const CONNECTORS = new Set(["da", "de", "do", "das", "dos", "e"]);

// "Maria Silva Oliveira" → "Maria S. Oliveira" (PRD F05 CPF message): first and last names,
// middle names as initials, connectors dropped. Exposes less personal data in a blocking message.
export function abbreviateName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words.join(" ");
  const first = words[0] ?? "";
  const last = words[words.length - 1] ?? "";
  const middle = words
    .slice(1, -1)
    .filter((word) => !CONNECTORS.has(word.toLowerCase()))
    .map((word) => `${word[0]?.toUpperCase() ?? ""}.`);
  return [first, ...middle, last].join(" ");
}

export function hasTwoWords(name: string): boolean {
  return name.trim().split(/\s+/).filter(Boolean).length >= 2;
}
