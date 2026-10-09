import { withTransaction } from "@/shared/db/transaction";
import { ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { utcToZonedParts } from "@/shared/kernel/zoned-time";
import { UNCLOSED_FLAG_AFTER_MINUTE } from "../domain/limits";
import { FinancialEntry } from "../domain/financial-entry";
import { occurrencesToAdd } from "../domain/recurrence";
import type { CashDeps } from "./ports";
import { copyRegister, entryChanges, registerChanges, systemContext } from "./support";

// System use cases run by the worker (architecture 5.5). They act on one organization with a system
// context, every change is audited as SYSTEM, and a retry finds nothing left to do.

// PRD F11: a register still open on a later day is flagged "Não fechado". Each unit acts after
// 00:05 of its own local day.
export async function flagUnclosedRegisters(
  deps: CashDeps,
  input: { organizationId: string; now?: Date },
): Promise<Result<{ flagged: number }>> {
  const now = input.now ?? deps.clock();
  const ctx = systemContext(input.organizationId);
  const units = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.unit.findMany({ where: { active: true }, select: { id: true, timeZone: true } })),
  );
  if (!units.ok) return units;

  let flagged = 0;
  for (const unit of units.value) {
    const local = utcToZonedParts(now, unit.timeZone);
    if (local.minute < UNCLOSED_FLAG_AFTER_MINUTE) continue;
    const ids = await withTransaction(ctx, async (uow) =>
      ok(await deps.registers.openBefore(uow, unit.id, local.date)),
    );
    if (!ids.ok) continue;
    for (const registerId of ids.value) {
      const done = await withTransaction(ctx, async (uow) => {
        const register = await deps.registers.findById(uow, registerId, { lock: true });
        if (!register) return ok(false);
        const before = copyRegister(register);
        if (!register.flagUnclosed(local.date, now)) return ok(false);
        if ((await deps.registers.save(uow, register)) === "STALE") return ok(false);
        await uow.audit.record({
          action: "UPDATE",
          entityType: "cash_register",
          entityId: register.id,
          summary: "Caixa marcado como não fechado",
          changes: registerChanges(before, register.snapshot),
        });
        return ok(true);
      });
      if (done.ok && done.value) flagged += 1;
    }
  }
  return ok({ flagged });
}

// PRD F11: a monthly series keeps 12 future occurrences until a manager ends it.
export async function extendRecurrences(
  deps: CashDeps,
  input: { organizationId: string; now?: Date },
): Promise<Result<{ created: number }>> {
  const now = input.now ?? deps.clock();
  const ctx = systemContext(input.organizationId);
  const prepared = await withTransaction(ctx, async (uow) => {
    const units = await uow.tx.unit.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, timeZone: true },
    });
    return ok({ series: await deps.entries.activeSeries(uow), units });
  });
  if (!prepared.ok) return prepared;

  let created = 0;
  for (const series of prepared.value.series) {
    const zone =
      prepared.value.units.find((unit) => unit.id === series.unitId)?.timeZone ??
      prepared.value.units[0]?.timeZone ??
      "UTC";
    const today = dateInTimeZone(now, zone);
    const done = await withTransaction(ctx, async (uow) => {
      const locked = await deps.entries.findSeries(uow, series.id, { lock: true });
      if (!locked || !locked.active) return ok(0);
      const indexes = await deps.entries.seriesIndexes(uow, locked.id);
      const missing = occurrencesToAdd({
        firstDueDate: locked.firstDueDate,
        existingIndexes: indexes,
        today,
      });
      for (const item of missing) {
        const entry = FinancialEntry.create({
          id: deps.newId(),
          organizationId: input.organizationId,
          kind: locked.kind,
          description: locked.description,
          categoryId: locked.categoryId,
          unitId: locked.unitId,
          currency: locked.currency,
          amountMinor: locked.amountMinor,
          dueDate: item.dueDate,
          seriesId: locked.id,
          occurrenceIndex: item.index,
          attachmentId: null,
          // The creator of a generated occurrence is the creator of the series.
          createdById: await seriesCreator(deps, uow, locked.id),
        });
        await deps.entries.insert(uow, entry);
        await uow.audit.record({
          action: "CREATE",
          entityType: "financial_entry",
          entityId: entry.snapshot.id,
          summary: "Ocorrência recorrente gerada",
          changes: entryChanges(null, entry.snapshot),
          metadata: { seriesId: locked.id, occurrenceIndex: item.index },
        });
      }
      return ok(missing.length);
    });
    if (done.ok) created += done.value;
  }
  return ok({ created });
}

async function seriesCreator(
  _deps: CashDeps,
  uow: Parameters<Parameters<typeof withTransaction>[1]>[0],
  seriesId: string,
): Promise<string> {
  const row = await uow.tx.financialEntrySeries.findFirst({
    where: { id: seriesId },
    select: { createdById: true },
  });
  return row?.createdById ?? "";
}

const PENDING_UPLOAD_HOURS = 24;

// Uploads that no movement or entry claimed within a day are removed from the bucket and the table.
export async function cleanupUploads(
  deps: CashDeps,
  input: { organizationId: string; now?: Date },
): Promise<Result<{ removed: number }>> {
  const now = input.now ?? deps.clock();
  const ctx = systemContext(input.organizationId);
  const cutoff = new Date(now.getTime() - PENDING_UPLOAD_HOURS * 3_600_000);
  const stale = await withTransaction(ctx, async (uow) =>
    ok(
      await uow.tx.financialAttachment.findMany({
        where: { status: "PENDING", createdAt: { lt: cutoff } },
        select: { id: true, objectKey: true },
      }),
    ),
  );
  if (!stale.ok) return stale;
  let removed = 0;
  for (const attachment of stale.value) {
    await deps.storage.delete(attachment.objectKey).catch(() => undefined);
    const done = await withTransaction(ctx, async (uow) => {
      const deleted = await uow.tx.financialAttachment.deleteMany({
        where: { id: attachment.id, status: "PENDING" },
      });
      return ok(deleted.count);
    });
    if (done.ok) removed += done.value;
  }
  return ok({ removed });
}
