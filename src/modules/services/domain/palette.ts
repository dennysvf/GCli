import { nextDefaultColor, PALETTE_COLORS, type PaletteColor } from "@/shared/kernel/palette";

// The 16 service colors (PRD F03) are the shared agenda palette, also used by professionals (F04).
export const SERVICE_COLORS = PALETTE_COLORS;
export type ServiceColor = PaletteColor;
export { nextDefaultColor };
