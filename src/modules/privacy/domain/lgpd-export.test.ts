import { describe, expect, it } from "vitest";
import { isDownloadable, isPastAvailability, LgpdExport } from "./lgpd-export";

const NOW = new Date("2026-10-18T13:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function started() {
  return LgpdExport.start({
    id: "01927a52-0000-7000-8000-000000000011",
    organizationId: "01927a52-0000-7000-8000-000000000002",
    requestId: "01927a52-0000-7000-8000-000000000001",
    locale: "pt-BR",
    requestedById: "01927a52-0000-7000-8000-000000000004",
    now: NOW,
  });
}

describe("LGPD export", () => {
  it("F14: an export is downloadable only while ready and before expiry", () => {
    const item = started();
    expect(isDownloadable(item.snapshot, NOW)).toBe(false);
    expect(item.markReady({ objectKey: "org/x/privacy/y.zip", sizeBytes: 10, fileCount: 2, now: NOW })).toBe(
      true,
    );
    const ready = item.snapshot;
    expect(ready.expiresAt?.getTime()).toBe(NOW.getTime() + 7 * DAY);
    expect(isDownloadable(ready, new Date(NOW.getTime() + 7 * DAY - 1))).toBe(true);
    expect(isDownloadable(ready, new Date(NOW.getTime() + 7 * DAY))).toBe(false);
    expect(isPastAvailability(ready, new Date(NOW.getTime() + 7 * DAY))).toBe(true);
    // A ready export cannot fail afterwards.
    expect(item.markFailed("STORAGE_ERROR", NOW)).toBe(false);
  });

  it("F14: a failed export never holds a file", () => {
    const item = started();
    expect(item.markFailed("FILE_MISSING", NOW)).toBe(true);
    expect(item.snapshot).toMatchObject({ status: "FAILED", objectKey: null, errorCode: "FILE_MISSING" });
    expect(item.markReady({ objectKey: "k", sizeBytes: 1, fileCount: 1, now: NOW })).toBe(false);
    expect(item.expire(NOW)).toBeNull();
  });

  it("F14: expiring a ready export clears its key and returns the file to delete", () => {
    const item = started();
    item.markReady({ objectKey: "org/x/privacy/y.zip", sizeBytes: 10, fileCount: 2, now: NOW });
    expect(item.expire(NOW)).toBe("org/x/privacy/y.zip");
    expect(item.snapshot).toMatchObject({ status: "EXPIRED", objectKey: null, expiredAt: NOW });
    expect(item.expire(NOW)).toBeNull();
  });
});
