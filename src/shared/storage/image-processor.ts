import convert from "heic-convert";
import sharp from "sharp";

// The prebuilt sharp binaries cannot decode HEVC, so HEIC goes through heic-convert (libheif in
// WebAssembly) to JPEG; sharp makes the thumbnails (architecture 5.5, spec F07 section 3). Shared
// by F07 and F08 (ADR-033).
const MAX_PIXELS = 100_000_000;

export const sharedImageProcessor = {
  async heicToJpeg(input: Uint8Array): Promise<Uint8Array> {
    const output = await convert({ buffer: input, format: "JPEG", quality: 0.9 });
    return new Uint8Array(output);
  },

  async thumbnail(input: Uint8Array, size: number): Promise<Uint8Array> {
    const output = await sharp(input, { limitInputPixels: MAX_PIXELS })
      // Photos from phones carry their orientation in metadata, which the thumbnail would lose.
      .rotate()
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return new Uint8Array(output);
  },
};
