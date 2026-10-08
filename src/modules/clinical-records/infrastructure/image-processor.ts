import { sharedImageProcessor } from "@/shared/storage/image-processor";
import type { ImageProcessor } from "../application/ports";
import { THUMBNAIL_SIZE } from "../domain/limits";

export const imageProcessor: ImageProcessor = {
  heicToJpeg: (input) => sharedImageProcessor.heicToJpeg(input),
  thumbnail: (input) => sharedImageProcessor.thumbnail(input, THUMBNAIL_SIZE),
};
