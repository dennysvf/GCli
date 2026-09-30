// The 16 service colors (PRD F03). Keys are stored; the UI maps them to classes and labels, so
// tones can change without a migration. The migration CHECK lists the same keys.
export const SERVICE_COLORS = [
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

export type ServiceColor = (typeof SERVICE_COLORS)[number];

const FALLBACK_COLOR: ServiceColor = "blue";

// First color no active service uses yet, so new services stand out on the agenda.
export function nextDefaultColor(usedColors: Iterable<string>): ServiceColor {
  const used = new Set(usedColors);
  return SERVICE_COLORS.find((color) => !used.has(color)) ?? FALLBACK_COLOR;
}
