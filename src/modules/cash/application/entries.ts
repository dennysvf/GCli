import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { countryProfile } from "@/shared/kernel/countries";
import { currencyOf } from "@/shared/kernel/countries/codes";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { CashErrors } from "../domain/errors";
import { CASH_EVENTS, cashEvent } from "../domain/events";
import { FinancialEntry, isOverdue, type EntryKind } from "../domain/financial-entry";
import { RECURRENCE_OCCURRENCES } from "../domain/limits";
import { occurrenceDueDate } from "../domain/recurrence";
import type { CashDeps, EntryRecord, UnitInfo } from "./ports";
import {
  createEntrySchema,
  deleteEntrySchema,
  endSeriesSchema,
  listEntriesSchema,
  payEntrySchema,
  reverseEntryPaymentSchema,
  updateEntrySchema,
} from "./schemas";
import { authorizeAny, entryChanges } from "./support";

export type EntryView = {
  id: string;
  kind: EntryKind;
  description: string;
  categoryId: string;
  categoryName: string;
  unitId: string | null;
  unitName: string | null;
  currency: string;
  amountMinor: number;
  dueDate: string;
  status: "PENDING" | "PAID";
  overdue: boolean;
  recurring: boolean;
  seriesId: string | null;
  paidOn: string | null;
  paymentMethod: string | null;
  attachmentId: string | null;
  attachmentName: string | null;
  version: number;
};

// "Today" for entries without a unit: the first active unit's zone, the one the front desk works in.
export function referenceTimeZone(units: readonly UnitInfo[]): string {
  return units.find((unit) => unit.active)?.timeZone ?? "UTC";
}

function entryView(record: EntryRecord, today: string, unitNames: Map<string, string>): EntryView {
  return {
    id: record.id,
    kind: record.kind,
    description: record.description,
    categoryId: record.categoryId,
    categoryName: record.categoryName,
    unitId: record.unitId,
    unitName: record.unitId ? (unitNames.get(record.unitId) ?? null) : null,
    currency: record.currency,
    amountMinor: record.amountMinor,
    dueDate: record.dueDate,
    status: record.status,
    overdue: isOverdue(record, today),
    recurring: record.seriesId !== null,
    seriesId: record.seriesId,
    paidOn: record.paidOn,
    paymentMethod: record.paymentMethod,
    attachmentId: record.attachmentId,
    attachmentName: record.attachmentName,
    version: record.version,
  };
}

// The currency of an entry: its unit's, or for "Geral" one used by an active unit (or the
// organization's own country), spec F11 section 3.
async function resolveCurrency(
  deps: CashDeps,
  ctx: RequestContext,
  unitId: string | null,
  currency: string,
): Promise<Result<{ country: UnitInfo["country"] }>> {
  if (unitId) {
    const unit = await deps.directory.unit(ctx, unitId);
    if (!unit || !unit.active) return fail(CashErrors.unitInvalid());
    if (unit.currency !== currency) return fail(CashErrors.currencyNotAvailable(currency));
    return ok({ country: unit.country });
  }
  const units = await deps.directory.units(ctx, { activeOnly: true });
  const known = new Set<string>([currencyOf(ctx.organizationCountry), ...units.map((unit) => unit.currency)]);
  if (!known.has(currency)) return fail(CashErrors.currencyNotAvailable(currency));
  const country = units.find((unit) => unit.currency === currency)?.country ?? ctx.organizationCountry;
  return ok({ country });
}

async function checkCategory(
  deps: CashDeps,
  uow: UnitOfWork,
  categoryId: string,
  kind: EntryKind,
): Promise<Result<void>> {
  const category = await deps.reads.category(uow, categoryId);
  if (!category || !category.active || category.kind !== kind)
    return fail(CashErrors.categoryNotAllowed(kind));
  return ok(undefined);
}

async function checkAttachment(
  deps: CashDeps,
  ctx: RequestContext,
  uow: UnitOfWork,
  attachmentId: string | null,
  current: string | null = null,
): Promise<Result<void>> {
  if (!attachmentId || attachmentId === current) return ok(undefined);
  const attachment = await deps.reads.attachment(uow, attachmentId);
  if (!attachment || attachment.status !== "PENDING" || attachment.uploadedById !== ctx.user.id) {
    return fail(CashErrors.attachmentInvalid());
  }
  return ok(undefined);
}

function methodAllowed(country: UnitInfo["country"], method: string): boolean {
  return countryProfile(country).paymentMethods.includes(method);
}

export type CreatedEntry = {
  entry: { id: string; status: "PENDING" | "PAID" };
  seriesId: string | null;
  occurrences: number;
};

// PRD F11: expenses and manual revenues. A monthly entry creates its series with 12 occurrences.
export async function createEntry(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<CreatedEntry>> {
  const allowed = await authorize(ctx, "finance:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createEntrySchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const scope = await resolveCurrency(deps, ctx, data.unitId, data.currency);
  if (!scope.ok) return scope;
  if (data.paid && !methodAllowed(scope.value.country, data.paid.method))
    return fail(CashErrors.methodInvalid());
  const now = deps.clock();

  return withTransaction(ctx, async (uow) => {
    const category = await checkCategory(deps, uow, data.categoryId, data.kind);
    if (!category.ok) return category;
    const attachment = await checkAttachment(deps, ctx, uow, data.attachmentId);
    if (!attachment.ok) return attachment;

    const seriesId = data.repeatMonthly ? deps.newId() : null;
    if (seriesId) {
      await deps.entries.insertSeries(uow, ctx.organizationId, {
        id: seriesId,
        kind: data.kind,
        description: data.description,
        categoryId: data.categoryId,
        unitId: data.unitId,
        currency: data.currency,
        amountMinor: data.amountMinor,
        firstDueDate: data.dueDate,
        active: true,
        createdById: ctx.user.id,
      });
    }
    const count = seriesId ? RECURRENCE_OCCURRENCES : 1;
    let first: FinancialEntry | null = null;
    for (let index = 0; index < count; index++) {
      const entry = FinancialEntry.create({
        id: deps.newId(),
        organizationId: ctx.organizationId,
        kind: data.kind,
        description: data.description,
        categoryId: data.categoryId,
        unitId: data.unitId,
        currency: data.currency,
        amountMinor: data.amountMinor,
        dueDate: seriesId ? occurrenceDueDate(data.dueDate, index) : data.dueDate,
        seriesId,
        occurrenceIndex: seriesId ? index : null,
        // The receipt belongs to the first occurrence only.
        attachmentId: index === 0 ? data.attachmentId : null,
        createdById: ctx.user.id,
      });
      if (index === 0 && data.paid) {
        const paid = entry.pay({
          paymentId: deps.newId(),
          paidOn: data.paid.paidOn,
          method: data.paid.method,
          userId: ctx.user.id,
          now,
        });
        if (!paid.ok) return paid;
      }
      await deps.entries.insert(uow, entry);
      // insert() writes the entry as pending; save() writes the payment of an entry created as paid.
      if (index === 0 && data.paid && (await deps.entries.save(uow, entry)) === "STALE") {
        return fail(CashErrors.stale());
      }
      await uow.audit.record({
        action: "CREATE",
        entityType: "financial_entry",
        entityId: entry.snapshot.id,
        summary: data.kind === "EXPENSE" ? "Despesa criada" : "Receita criada",
        changes: entryChanges(null, entry.snapshot),
        metadata: { seriesId, occurrenceIndex: seriesId ? index : null },
      });
      await uow.publish(
        cashEvent(
          CASH_EVENTS.entryCreated,
          {
            entryId: entry.snapshot.id,
            kind: data.kind,
            unitId: data.unitId,
            currency: data.currency,
            amountMinor: data.amountMinor,
            actorUserId: ctx.user.id,
          },
          now,
        ),
      );
      if (index === 0) first = entry;
    }
    if (!first) return fail(CashErrors.stale());
    return ok({
      entry: { id: first.snapshot.id, status: first.snapshot.status },
      seriesId,
      occurrences: count,
    });
  });
}

// Edits a pending entry; "FOLLOWING" applies the same fields to the next pending occurrences of the
// series and to the series template (PRD F11, interview).
export async function updateEntry(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ updated: number }>> {
  const allowed = await authorize(ctx, "finance:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(updateEntrySchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const scope = await resolveCurrency(deps, ctx, data.unitId, data.currency);
  if (!scope.ok) return scope;

  return withTransaction(ctx, async (uow) => {
    const entry = await deps.entries.findById(uow, data.entryId, { lock: true });
    if (!entry) return fail(CashErrors.entryNotFound());
    const category = await checkCategory(deps, uow, data.categoryId, entry.snapshot.kind);
    if (!category.ok) return category;
    const attachment = await checkAttachment(deps, ctx, uow, data.attachmentId, entry.snapshot.attachmentId);
    if (!attachment.ok) return attachment;
    if (data.version !== undefined && entry.snapshot.version !== data.version)
      return fail(CashErrors.stale());

    const targets: FinancialEntry[] = [entry];
    if (data.scope === "FOLLOWING" && entry.snapshot.seriesId) {
      const ids = await deps.entries.followingPending(uow, entry.snapshot.seriesId, entry.snapshot.dueDate);
      for (const id of ids) {
        if (id === entry.snapshot.id) continue;
        const next = await deps.entries.findById(uow, id, { lock: true });
        if (next) targets.push(next);
      }
      await deps.entries.updateSeries(uow, entry.snapshot.seriesId, {
        description: data.description,
        categoryId: data.categoryId,
        unitId: data.unitId,
        currency: data.currency,
        amountMinor: data.amountMinor,
      });
    }
    for (const target of targets) {
      const before = { ...target.snapshot };
      const edited = target.edit({
        description: data.description,
        categoryId: data.categoryId,
        unitId: data.unitId,
        currency: data.currency,
        amountMinor: data.amountMinor,
        // Only the edited occurrence moves its date and receipt.
        dueDate: target === entry ? data.dueDate : target.snapshot.dueDate,
        attachmentId: target === entry ? data.attachmentId : target.snapshot.attachmentId,
      });
      if (!edited.ok) return edited;
      if ((await deps.entries.save(uow, target)) === "STALE") return fail(CashErrors.stale());
      await uow.audit.record({
        action: "UPDATE",
        entityType: "financial_entry",
        entityId: target.snapshot.id,
        summary: "Lançamento atualizado",
        changes: entryChanges(before, target.snapshot),
        metadata: { scope: data.scope },
      });
    }
    return ok({ updated: targets.length });
  });
}

// PRD F11: only a pending entry ("a pagar") is deleted, by a manager; the row stays (soft delete).
export async function deleteEntry(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ removed: number }>> {
  const allowed = await authorize(ctx, "finance:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(deleteEntrySchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const now = deps.clock();
  return withTransaction(ctx, async (uow) => {
    const entry = await deps.entries.findById(uow, data.entryId, { lock: true });
    if (!entry) return fail(CashErrors.entryNotFound());
    if (entry.isPaid) return fail(CashErrors.entryPaid());
    const s = entry.snapshot;
    let removed = 0;
    if (data.scope === "FOLLOWING" && s.seriesId) {
      removed = await deps.entries.endSeries(uow, s.seriesId, ctx.user.id, now, s.dueDate);
    } else {
      const deleted = entry.softDelete({ userId: ctx.user.id, now });
      if (!deleted.ok) return deleted;
      if ((await deps.entries.save(uow, entry)) === "STALE") return fail(CashErrors.stale());
      removed = 1;
    }
    await uow.audit.record({
      action: "DELETE",
      entityType: "financial_entry",
      entityId: s.id,
      summary: "Lançamento excluído",
      metadata: { scope: data.scope, removed, seriesId: s.seriesId },
    });
    await uow.publish(
      cashEvent(
        CASH_EVENTS.entryDeleted,
        {
          entryId: s.id,
          kind: s.kind,
          unitId: s.unitId,
          currency: s.currency,
          amountMinor: s.amountMinor,
          actorUserId: ctx.user.id,
        },
        now,
      ),
    );
    return ok({ removed });
  });
}

// PRD F11: "Marcar como pago".
export async function payEntry(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ paid: true }>> {
  const allowed = await authorize(ctx, "finance:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(payEntrySchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const now = deps.clock();
  return withTransaction(ctx, async (uow) => {
    const entry = await deps.entries.findById(uow, data.entryId, { lock: true });
    if (!entry) return fail(CashErrors.entryNotFound());
    const scope = await resolveCurrency(deps, ctx, entry.snapshot.unitId, entry.snapshot.currency);
    if (!scope.ok) return scope;
    if (!methodAllowed(scope.value.country, data.method)) return fail(CashErrors.methodInvalid());
    const before = { ...entry.snapshot };
    const paid = entry.pay({
      paymentId: deps.newId(),
      paidOn: data.paidOn,
      method: data.method,
      userId: ctx.user.id,
      now,
    });
    if (!paid.ok) return paid;
    if ((await deps.entries.save(uow, entry)) === "STALE") return fail(CashErrors.stale());
    await uow.audit.record({
      action: "UPDATE",
      entityType: "financial_entry",
      entityId: entry.snapshot.id,
      summary: entry.snapshot.kind === "EXPENSE" ? "Despesa paga" : "Receita recebida",
      changes: entryChanges(before, entry.snapshot),
      metadata: { paidOn: data.paidOn, method: data.method },
    });
    await uow.publish(
      cashEvent(
        CASH_EVENTS.entryPaid,
        {
          entryId: entry.snapshot.id,
          kind: entry.snapshot.kind,
          unitId: entry.snapshot.unitId,
          currency: entry.snapshot.currency,
          amountMinor: entry.snapshot.amountMinor,
          actorUserId: ctx.user.id,
        },
        now,
      ),
    );
    return ok({ paid: true });
  });
}

// PRD F11: a paid entry is reversed with a reason; the payment row and the reversal stay in history.
export async function reverseEntryPayment(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ reversed: true }>> {
  const allowed = await authorize(ctx, "finance:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(reverseEntryPaymentSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const now = deps.clock();
  return withTransaction(ctx, async (uow) => {
    const entry = await deps.entries.findById(uow, data.entryId, { lock: true });
    if (!entry) return fail(CashErrors.entryNotFound());
    const before = { ...entry.snapshot };
    const reversed = entry.reversePayment({ reason: data.reason, userId: ctx.user.id, now });
    if (!reversed.ok) return reversed;
    if ((await deps.entries.save(uow, entry)) === "STALE") return fail(CashErrors.stale());
    await uow.audit.record({
      action: "UPDATE",
      entityType: "financial_entry",
      entityId: entry.snapshot.id,
      summary: "Pagamento do lançamento estornado",
      changes: entryChanges(before, entry.snapshot),
      metadata: { reason: data.reason },
    });
    await uow.publish(
      cashEvent(
        CASH_EVENTS.entryPaymentReversed,
        {
          entryId: entry.snapshot.id,
          kind: entry.snapshot.kind,
          unitId: entry.snapshot.unitId,
          currency: entry.snapshot.currency,
          amountMinor: entry.snapshot.amountMinor,
          actorUserId: ctx.user.id,
        },
        now,
      ),
    );
    return ok({ reversed: true });
  });
}

// PRD F11: "Encerrar recorrência" removes the future pending occurrences and stops the series.
export async function endSeries(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ removed: number }>> {
  const allowed = await authorize(ctx, "finance:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(endSeriesSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();
  const units = await deps.directory.units(ctx, { activeOnly: true });
  const today = dateInTimeZone(now, referenceTimeZone(units));
  return withTransaction(ctx, async (uow) => {
    const series = await deps.entries.findSeries(uow, parsed.value.seriesId, { lock: true });
    if (!series) return fail(CashErrors.seriesNotFound());
    if (!series.active) return fail(CashErrors.seriesEnded());
    const removed = await deps.entries.endSeries(uow, series.id, ctx.user.id, now, today);
    await uow.audit.record({
      action: "UPDATE",
      entityType: "financial_entry_series",
      entityId: series.id,
      summary: "Recorrência encerrada",
      metadata: { removed },
    });
    return ok({ removed });
  });
}

export type EntryList = { entries: EntryView[]; today: string };

export async function listEntries(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<EntryList>> {
  const allowed = await authorizeAny(ctx, ["finance:manage"]);
  if (!allowed.ok) return allowed;
  const parsed = parseInput(listEntriesSchema, input);
  if (!parsed.ok) return parsed;
  const units = await deps.directory.units(ctx, { activeOnly: false });
  const today = dateInTimeZone(deps.clock(), referenceTimeZone(units));
  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]));
  return withTransaction(ctx, async (uow) => {
    const rows = await deps.entries.list(uow, { ...parsed.value, today });
    return ok({ entries: rows.map((row) => entryView(row, today, unitNames)), today });
  });
}
