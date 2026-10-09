// Public API of the cash module (spec F11 section 5). Use cases are wired here with their
// infrastructure adapters; callers never import files inside the module.
import { billing } from "@/modules/billing";
import { units } from "@/modules/units";
import type { RequestContext } from "@/shared/context/types";
import { newId } from "@/shared/kernel/ids";
import { createUploadIntent, getAttachmentDownload } from "./application/attachments";
import { listCategories, saveCategory, setCategoryActive } from "./application/categories";
import {
  createEntry,
  deleteEntry,
  endSeries,
  listEntries,
  payEntry,
  reverseEntryPayment,
  updateEntry,
} from "./application/entries";
import { cleanupUploads, extendRecurrences, flagUnclosedRegisters } from "./application/jobs";
import type { CashDeps } from "./application/ports";
import {
  closeRegister,
  getRegisterDay,
  openRegister,
  recordMovement,
  reopenRegister,
  reverseMovement,
} from "./application/registers";
import { getStatement } from "./application/statement";
import { attachmentStorage } from "./infrastructure/attachment-storage";
import { billingGateway } from "./infrastructure/billing-gateway";
import { cashDirectory } from "./infrastructure/directory";
import { prismaCashReads } from "./infrastructure/prisma-cash-reads";
import { prismaEntryRepository } from "./infrastructure/prisma-entry-repository";
import { prismaRegisterRepository } from "./infrastructure/prisma-register-repository";
import { cashRegisterGate } from "./infrastructure/register-gate";

const baseDeps: CashDeps = {
  registers: prismaRegisterRepository,
  entries: prismaEntryRepository,
  reads: prismaCashReads,
  directory: cashDirectory,
  billing: billingGateway,
  storage: attachmentStorage,
  clock: () => new Date(),
  newId,
};

// The use cases bound to their dependencies. `adjust` lets tests replace an adapter (a clock, the
// storage) while the rest stays real.
export function createCash(adjust?: (base: CashDeps) => CashDeps) {
  const deps = adjust ? adjust(baseDeps) : baseDeps;
  return {
    // Cash register
    getRegisterDay: (ctx: RequestContext, input: unknown) => getRegisterDay(deps, ctx, input),
    openRegister: (ctx: RequestContext, input: unknown) => openRegister(deps, ctx, input),
    recordMovement: (ctx: RequestContext, input: unknown) => recordMovement(deps, ctx, input),
    reverseMovement: (ctx: RequestContext, input: unknown) => reverseMovement(deps, ctx, input),
    closeRegister: (ctx: RequestContext, input: unknown) => closeRegister(deps, ctx, input),
    reopenRegister: (ctx: RequestContext, input: unknown) => reopenRegister(deps, ctx, input),
    // Expenses and manual revenues
    createEntry: (ctx: RequestContext, input: unknown) => createEntry(deps, ctx, input),
    updateEntry: (ctx: RequestContext, input: unknown) => updateEntry(deps, ctx, input),
    deleteEntry: (ctx: RequestContext, input: unknown) => deleteEntry(deps, ctx, input),
    payEntry: (ctx: RequestContext, input: unknown) => payEntry(deps, ctx, input),
    reverseEntryPayment: (ctx: RequestContext, input: unknown) => reverseEntryPayment(deps, ctx, input),
    endSeries: (ctx: RequestContext, input: unknown) => endSeries(deps, ctx, input),
    listEntries: (ctx: RequestContext, input: unknown) => listEntries(deps, ctx, input),
    // Statement and categories
    getStatement: (ctx: RequestContext, input: unknown) => getStatement(deps, ctx, input),
    listCategories: (ctx: RequestContext) => listCategories(deps, ctx),
    saveCategory: (ctx: RequestContext, input: unknown) => saveCategory(deps, ctx, input),
    setCategoryActive: (ctx: RequestContext, input: unknown) => setCategoryActive(deps, ctx, input),
    // Attachments
    createUploadIntent: (ctx: RequestContext, input: unknown) => createUploadIntent(deps, ctx, input),
    getAttachmentDownload: (ctx: RequestContext, input: unknown) => getAttachmentDownload(deps, ctx, input),
    // Worker
    flagUnclosedRegisters: (input: { organizationId: string; now?: Date }) =>
      flagUnclosedRegisters(deps, input),
    extendRecurrences: (input: { organizationId: string; now?: Date }) => extendRecurrences(deps, input),
    cleanupUploads: (input: { organizationId: string; now?: Date }) => cleanupUploads(deps, input),
  };
}

export const cash = createCash();

// Wired by the composition root after billing's own ports: the gate that closes a day for
// payments, and the units port with both billing's and cash's records (ADR-036).
export function registerCashPorts(): void {
  billing.registerCashRegisterGate(cashRegisterGate);
  units.registerUnitFinancialRecords({
    async hasAnyInUnit(organizationId, unitId) {
      if (await billing.hasUnitFinancialRecords(organizationId, unitId)) return true;
      return prismaRegisterRepository.hasAnyInUnit(organizationId, unitId);
    },
  });
}

export { cashCatalog } from "./messages/catalog";
export { CASH_EVENTS } from "./domain/events";
export type {
  CashRegisterEventPayload,
  CashMovementEventPayload,
  FinancialEntryEventPayload,
} from "./domain/events";
export type { CashDeps } from "./application/ports";
export type { CategoryRecord, CategoryKind } from "./application/ports";
export type { UploadIntent } from "./application/attachments";
export type { EntryList, EntryView, CreatedEntry } from "./application/entries";
export type { CloseResult, MovementResult, OpenResult } from "./application/registers";
export type { StatementView as StatementData } from "./application/statement";
export type { DayLine, HistoryItem, RegisterDay, RegisterView } from "./application/views";
export { CashRegisterView, CategoriesPanel, EntriesView, StatementView } from "./client";
export type { CashActions, EntryFields, FinanceActions } from "./client";
