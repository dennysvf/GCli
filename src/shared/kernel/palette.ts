// The 16 agenda colors (PRD F03 services, F04 professionals). Keys are stored; the UI maps them to
// classes and labels, so tones can change without a migration. Migrations 0004 and 0005 list the
// same keys in CHECK constraints.
export const PALETTE_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "pink",
] as const;

export type PaletteColor = (typeof PALETTE_COLORS)[number];

const FALLBACK_COLOR: PaletteColor = "blue";

// First color not used yet, so new services and professionals stand out on the agenda.
export function nextDefaultColor(usedColors: Iterable<string>): PaletteColor {
  const used = new Set(usedColors);
  return PALETTE_COLORS.find((color) => !used.has(color)) ?? FALLBACK_COLOR;
}
