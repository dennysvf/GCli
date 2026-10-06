import convert from "heic-convert";
import sharp from "sharp";
import type { ImageProcessor } from "../application/ports";
import { THUMBNAIL_SIZE } from "../domain/limits";

// The prebuilt sharp binaries cannot decode HEVC, so HEIC goes through heic-convert (libheif in
// WebAssembly) to JPEG; sharp makes the thumbnails (architecture 5.5, spec F07 section 3).
const MAX_PIXELS = 100_000_000;

export const imageProcessor: ImageProcessor = {
  async heicToJpeg(input) {
    const output = await convert({ buffer: input, format: "JPEG", quality: 0.9 });
    return new Uint8Array(output);
  },

  async thumbnail(input) {
    const output = await sharp(input, { limitInputPixels: MAX_PIXELS })
      // Photos from phones carry their orientation in metadata, which the thumbnail would lose.
      .rotate()
      .resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return new Uint8Array(output);
  },
};
