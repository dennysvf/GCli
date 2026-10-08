import { describe, expect, it } from "vitest";
import { nextClinicalFlag } from "./clinical-flag";
import { cleanFileName, declaredUploadType, isFileSizeAllowed, titleFromFileName } from "./document-file";
import { MAX_FILE_BYTES, QUOTA_BYTES } from "./limits";
import { canStore, crossedAlert, reachesAlert, usageLevel, usagePercent } from "./quota";

describe("storage quota", () => {
  it("F08: quota allows storing up to exactly 50 GiB", () => {
    expect(canStore(QUOTA_BYTES - 1000, 1000)).toBe(true);
    expect(canStore(QUOTA_BYTES - 1000, 1001)).toBe(false);
    expect(canStore(0, MAX_FILE_BYTES)).toBe(true);
  });

  it("F08: the 80% alert triggers only when crossing", () => {
    const eighty = (QUOTA_BYTES * 80) / 100;
    expect(crossedAlert(eighty - 1, eighty)).toBe(true);
    expect(crossedAlert(eighty, eighty + 5_000_000)).toBe(false);
    expect(crossedAlert(eighty + 5_000_000, eighty - 1)).toBe(false);
    expect(reachesAlert(eighty - 1)).toBe(false);
    expect(reachesAlert(eighty)).toBe(true);
  });

  it("F08: usage levels and percent", () => {
    expect(usageLevel(0)).toBe("ok");
    expect(usageLevel((QUOTA_BYTES * 80) / 100)).toBe("warning");
    expect(usageLevel(QUOTA_BYTES)).toBe("full");
    expect(usagePercent(QUOTA_BYTES / 2)).toBe(50);
    expect(usagePercent(QUOTA_BYTES * 2)).toBe(100);
  });
});

describe("clinical flag", () => {
  it("F08: the clinical flag never turns off", () => {
    expect(nextClinicalFlag(true, true)).toBe(true);
    expect(nextClinicalFlag(true, false)).toBe(true);
    expect(nextClinicalFlag(false, true)).toBe(true);
    expect(nextClinicalFlag(false, false)).toBe(false);
  });
});

describe("document files", () => {
  it("F08: declared types accept PDF, images and DOCX, and HEIF is stored as HEIC", () => {
    expect(declaredUploadType("application/pdf")).toBe("application/pdf");
    expect(declaredUploadType("IMAGE/HEIF")).toBe("image/heic");
    expect(declaredUploadType("application/zip")).toBeNull();
    expect(declaredUploadType("application/vnd.ms-word.document.macroEnabled.12")).toBeNull();
  });

  it("F08: files are limited to 20 MB", () => {
    expect(isFileSizeAllowed(MAX_FILE_BYTES)).toBe(true);
    expect(isFileSizeAllowed(MAX_FILE_BYTES + 1)).toBe(false);
    expect(isFileSizeAllowed(0)).toBe(false);
    expect(isFileSizeAllowed(1.5)).toBe(false);
  });

  it("F08: the title defaults to the file name without its extension", () => {
    expect(titleFromFileName("hemograma setembro.pdf")).toBe("hemograma setembro");
    expect(titleFromFileName("sem-extensao")).toBe("sem-extensao");
    expect(titleFromFileName(".oculto")).toBe(".oculto");
    expect(cleanFileName("a\u0000b\u001f.pdf")).toBe("ab.pdf");
    expect(cleanFileName("   ")).toBe("arquivo");
    expect(cleanFileName("x".repeat(400))).toHaveLength(255);
  });
});
