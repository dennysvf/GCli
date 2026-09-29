import sharp from "sharp";
import * as rateLimiter from "@/shared/security/rate-limiter";
import { objectStorage } from "@/shared/storage/object-storage";
import type { LogoProcessor, LogoStore, RateLimiter } from "../application/ports";

export const postgresRateLimiter: RateLimiter = {
  consume: rateLimiter.consume,
  isBlocked: rateLimiter.isBlocked,
  registerFailure: rateLimiter.registerFailure,
  clear: rateLimiter.clear,
};

export const s3LogoStore: LogoStore = {
  put: (key, body, contentType) => objectStorage().put(key, body, contentType),
  get: (key) => objectStorage().get(key),
  delete: (key) => objectStorage().delete(key),
};

// Rasterizing removes any script content an SVG might carry and gives PDF generation (F08) a
// uniform PNG (spec section 3, "Logo handling").
export const sharpLogoProcessor: LogoProcessor = {
  async toPng(input, maxWidth, maxHeight) {
    const output = await sharp(input, { limitInputPixels: 50_000_000 })
      .resize({ width: maxWidth, height: maxHeight, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return new Uint8Array(output);
  },
};
