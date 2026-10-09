import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cash, createCash } from "@/modules/cash";
import { db } from "@/shared/db/client";
import { zonedTimeToUtc } from "@/shared/kernel/zoned-time";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  addDays,
  billingWorld,
  categoryId,
  mustCreateEntry,
  mustMove,
  mustOpen,
  today,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

async function localInstant(time: string): Promise<Date> {
  const unit = await db().unit.findUniqueOrThrow({ where: { id: world.unitId } });
  return zonedTimeToUtc(`${await today(world)}T${time}`, unit.timeZone);
}

describe("unclosed registers", () => {
  it("F11: unclosed registers of earlier days are flagged after 00:05 in the unit time zone", async () => {
    const yesterday = addDays(await today(world), -1);
    const opened = await cash.openRegister(world.manager, {
      unitId: world.unitId,
      businessDate: yesterday,
      openingMinor: 0,
    });
    if (!opened.ok) throw new Error(opened.error.code);

    const early = await cash.flagUnclosedRegisters({
      organizationId: world.organizationId,
      now: await localInstant("00:02"),
    });
    expect(early.ok && early.value.flagged).toBe(0);
    const late = await cash.flagUnclosedRegisters({
      organizationId: world.organizationId,
      now: await localInstant("00:06"),
    });
    expect(late.ok && late.value.flagged).toBe(1);
    const again = await cash.flagUnclosedRegisters({
      organizationId: world.organizationId,
      now: await localInstant("12:00"),
    });
    expect(again.ok && again.value.flagged).toBe(0);
    expect(
      (await db().cashRegister.findUniqueOrThrow({ where: { id: opened.value.register.id } }))
        .flaggedUnclosed,
    ).toBe(true);

    // The banner lists it for the day of the front desk, which can still close it.
    const day = await cash.getRegisterDay(world.desk, {
      unitId: world.unitId,
      businessDate: await today(world),
    });
    expect(day.ok && day.value.pendingUnclosed).toEqual([
      { registerId: opened.value.register.id, businessDate: yesterday },
    ]);
    const closed = await cash.closeRegister(world.desk, {
      registerId: opened.value.register.id,
      countedMinor: 0,
    });
    expect(closed.ok).toBe(true);
    const closing = await db().cashRegisterClosing.findFirstOrThrow({
      where: { registerId: opened.value.register.id },
    });
    expect(closing.wasFlaggedUnclosed).toBe(true);
  });
});

describe("recurrence", () => {
  it("F11: the recurrence job keeps 12 future occurrences until the series ends", async () => {
    const date = await today(world);
    const created = await mustCreateEntry(world, { repeatMonthly: true, dueDate: addDays(date, -40) });
    const now = await localInstant("12:00");
    const first = await cash.extendRecurrences({ organizationId: world.organizationId, now });
    expect(first.ok && first.value.created).toBeGreaterThan(0);
    const indexes = await db().financialEntry.findMany({
      where: { seriesId: created.seriesId },
      orderBy: { occurrenceIndex: "asc" },
    });
    const future = indexes.filter((row) => row.dueDate.toISOString().slice(0, 10) >= date);
    expect(future).toHaveLength(12);
    const again = await cash.extendRecurrences({ organizationId: world.organizationId, now });
    expect(again.ok && again.value.created).toBe(0);

    await cash.endSeries(world.manager, { seriesId: created.seriesId });
    const after = await cash.extendRecurrences({ organizationId: world.organizationId, now });
    expect(after.ok && after.value.created).toBe(0);
  });
});

describe("attachments", () => {
  const stored: string[] = [];
  const storage = {
    presignUpload: async (key: string) => `https://bucket.test/${key}`,
    presignDownload: async (key: string, fileName: string) => `https://bucket.test/${key}?name=${fileName}`,
    delete: async (key: string) => void stored.push(key),
  };
  const withStorage = createCash((base) => ({ ...base, storage }));

  it("F11: a receipt is uploaded, attached to a movement and downloaded; invalid files are refused", async () => {
    const register = await mustOpen(world);
    const intent = await withStorage.createUploadIntent(world.desk, {
      fileName: "recibo material.pdf",
      contentType: "application/pdf",
      sizeBytes: 120_000,
    });
    if (!intent.ok) throw new Error(intent.error.code);
    expect(intent.value.uploadUrl).toContain("/finance/");

    const bad = await withStorage.createUploadIntent(world.desk, {
      fileName: "script.exe",
      contentType: "application/x-msdownload",
      sizeBytes: 100,
    });
    expect(!bad.ok && bad.error.code).toBe("FINANCE_ATTACHMENT_INVALID");
    const huge = await withStorage.createUploadIntent(world.desk, {
      fileName: "grande.pdf",
      contentType: "application/pdf",
      sizeBytes: 10 * 1024 * 1024 + 1,
    });
    expect(!huge.ok && huge.error.code).toBe("FINANCE_ATTACHMENT_INVALID");

    // Nothing to download until a movement claims it.
    const early = await withStorage.getAttachmentDownload(world.desk, {
      attachmentId: intent.value.attachmentId,
    });
    expect(early.ok).toBe(false);
    await mustMove(world, register.id, "OUT", 2_500, { attachmentId: intent.value.attachmentId });
    const download = await withStorage.getAttachmentDownload(world.desk, {
      attachmentId: intent.value.attachmentId,
    });
    expect(download.ok && download.value.url).toContain("name=recibo material.pdf");

    // A second movement cannot reuse the same receipt.
    const reuse = await cash.recordMovement(world.desk, {
      registerId: register.id,
      direction: "OUT",
      amountMinor: 1_000,
      description: "Outra compra",
      categoryId: await categoryId(world, "EXPENSE"),
      attachmentId: intent.value.attachmentId,
    });
    expect(!reuse.ok && reuse.error.code).toBe("FINANCE_ATTACHMENT_INVALID");
  });

  it("F11: abandoned uploads are cleaned up after a day and attached ones are kept", async () => {
    const register = await mustOpen(world);
    const kept = await withStorage.createUploadIntent(world.desk, {
      fileName: "a.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
    });
    const abandoned = await withStorage.createUploadIntent(world.desk, {
      fileName: "b.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
    });
    if (!kept.ok || !abandoned.ok) throw new Error("intent failed");
    await mustMove(world, register.id, "OUT", 1_000, { attachmentId: kept.value.attachmentId });
    await db().financialAttachment.updateMany({
      data: { createdAt: new Date(Date.now() - 48 * 3_600_000) },
    });
    stored.length = 0;
    const cleaned = await withStorage.cleanupUploads({ organizationId: world.organizationId });
    expect(cleaned.ok && cleaned.value.removed).toBe(1);
    expect(stored).toHaveLength(1);
    expect(await db().financialAttachment.count()).toBe(1);
  });
});
