import type { PaletteColor } from "@/shared/kernel/palette";

// Visual mapping of the agenda color keys (spec F03 section 3, F04 professionals). Class names are literal so
// Tailwind generates them: 500 for swatches and the agenda accent, 100 background with 900 text
// for readable chips (AA contrast in light and dark themes).
export const PALETTE: Record<PaletteColor, { swatch: string; chip: string }> = {
  slate: { swatch: "bg-slate-500", chip: "bg-slate-100 text-slate-900 border-slate-500" },
  red: { swatch: "bg-red-500", chip: "bg-red-100 text-red-900 border-red-500" },
  orange: {
    swatch: "bg-orange-500",
    chip: "bg-orange-100 text-orange-900 border-orange-500",
  },
  amber: { swatch: "bg-amber-500", chip: "bg-amber-100 text-amber-900 border-amber-500" },
  yellow: {
    swatch: "bg-yellow-500",
    chip: "bg-yellow-100 text-yellow-900 border-yellow-500",
  },
  lime: { swatch: "bg-lime-500", chip: "bg-lime-100 text-lime-900 border-lime-500" },
  green: { swatch: "bg-green-500", chip: "bg-green-100 text-green-900 border-green-500" },
  emerald: {
    swatch: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-900 border-emerald-500",
  },
  teal: { swatch: "bg-teal-500", chip: "bg-teal-100 text-teal-900 border-teal-500" },
  cyan: { swatch: "bg-cyan-500", chip: "bg-cyan-100 text-cyan-900 border-cyan-500" },
  sky: { swatch: "bg-sky-500", chip: "bg-sky-100 text-sky-900 border-sky-500" },
  blue: { swatch: "bg-blue-500", chip: "bg-blue-100 text-blue-900 border-blue-500" },
  indigo: {
    swatch: "bg-indigo-500",
    chip: "bg-indigo-100 text-indigo-900 border-indigo-500",
  },
  violet: {
    swatch: "bg-violet-500",
    chip: "bg-violet-100 text-violet-900 border-violet-500",
  },
  purple: { swatch: "bg-purple-500", chip: "bg-purple-100 text-purple-900 border-purple-500" },
  pink: { swatch: "bg-pink-500", chip: "bg-pink-100 text-pink-900 border-pink-500" },
};
