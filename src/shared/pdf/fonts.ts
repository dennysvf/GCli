import path from "node:path";
import { Font } from "@react-pdf/renderer";

// Static Source Sans 3 and Source Serif 4 files (OFL, see OFL-LICENSE.txt). The variable woff2
// files served to the browser cannot be read by the PDF engine (ADR-024). The sources folder is
// part of the Docker image, so the files resolve from the working directory in every process.
const FONTS_DIR = path.join(process.cwd(), "src", "shared", "pdf", "fonts");

export const PDF_FONTS = { sans: "SourceSans3", serif: "SourceSerif4" } as const;

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  registered = true;
  Font.register({
    family: PDF_FONTS.sans,
    fonts: [
      { src: path.join(FONTS_DIR, "source-sans-3-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(FONTS_DIR, "source-sans-3-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: PDF_FONTS.serif,
    fonts: [{ src: path.join(FONTS_DIR, "source-serif-4-latin-600-normal.woff"), fontWeight: 600 }],
  });
  // Words are not hyphenated: names and phone numbers must stay whole.
  Font.registerHyphenationCallback((word) => [word]);
}
