import { authorize } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { CashRegister, checkOpenDate } from "../domain/cash-register";
import { CashErrors } from "../domain/errors";
import { CASH_EVENTS, cashEvent } from "../domain/events";
import type { CashDeps } from "./ports";
import {
  closeRegisterSchema,
  openRegisterSchema,
  recordMovementSchema,
  registerDaySchema,
  reopenRegisterSchema,
  reverseMovementSchema,
} from "./schemas";
import { copyRegister, dayWindow, loadUnit, moneyText, mutateRegister, registerChanges } from "./support";
import {
  dayFigures,
  dayLines,
  historyItems,
  registerView,
  unitView,
  type RegisterDay,
  type RegisterView,
} from "./views";

// The day of a unit: its register (if any), the payments read from billing, the movements and the
// history (spec F11 section 5). Payments are read, never copied (ADR-036).
export async function getRegisterDay(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<RegisterDay>> {
  const allowed = await authorize(ctx, "cash:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(registerDaySchema, input);
  if (!parsed.ok) return parsed;
  const { unitId, businessDate } = parsed.value;
  const unit = await loadUnit(deps, ctx, unitId);
  if (!unit.ok) return unit;
  const now = deps.clock();
  const today = dateInTimeZone(now, unit.value.timeZone);
  const window = dayWindow(businessDate, unit.value.timeZone);
  const payments = await deps.billing.payments(ctx, {
    unitIds: [unitId],
    currency: unit.value.currency,
    from: window.from,
    to: window.to,
  });
  if (!payments.ok) return payments;

  const loaded = await withTransaction(ctx, async (uow) => {
    const register = await deps.registers.findByUnitDay(uow, unitId, businessDate, { lock: false });
    const [suggested, pending, movements, closings, reopenings] = await Promise.all([
      register
        ? Promise.resolve(register.snapshot.suggestedOpeningMinor)
        : deps.registers.lastCounted(uow, unitId, businessDate),
      deps.registers.unclosedBefore(uow, unitId, today),
      register ? deps.registers.movements(uow, register.id) : Promise.resolve([]),
      register ? deps.registers.closings(uow, register.id) : Promise.resolve([]),
      register ? deps.registers.reopenings(uow, register.id) : Promise.resolve([]),
    ]);
    return ok({ register, suggested: suggested ?? 0, pending, movements, closings, reopenings });
  });
  if (!loaded.ok) return loaded;
  const { register, suggested, pending, movements, closings, reopenings } = loaded.value;

  const figures = dayFigures(register?.snapshot.openingMinor ?? suggested, payments.value, movements);
  return ok({
    unit: unitView(unit.value),
    businessDate,
    today,
    register: register ? registerView(register) : null,
    currency: unit.value.currency,
    suggestedOpeningMinor: suggested,
    expectedMinor: register ? figures.expectedMinor : null,
    byMethod: figures.byMethod,
    lines: await dayLines(deps, ctx, payments.value, movements),
    history: await historyItems(deps, ctx, closings, reopenings),
    pendingUnclosed: pending.map((item) => ({ registerId: item.id, businessDate: item.businessDate })),
  });
}

export type OpenResult = { register: RegisterView; alreadyOpen: boolean };

// PRD F11: one register per unit and day. Opening a date that already has one returns it.
export async function openRegister(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<OpenResult>> {
  const allowed = await authorize(ctx, "cash:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(openRegisterSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const unit = await loadUnit(deps, ctx, data.unitId);
  if (!unit.ok) return unit;
  if (!unit.value.active) return fail(CashErrors.unitInvalid());
  const now = deps.clock();
  const today = dateInTimeZone(now, unit.value.timeZone);
  const dateCheck = checkOpenDate({
    businessDate: data.businessDate,
    today,
    canOpenPast: can(ctx, "cash:reopen"),
  });
  if (!dateCheck.ok) return dateCheck;

  return withTransaction<OpenResult>(ctx, async (uow) => {
    const existing = await deps.registers.findByUnitDay(uow, data.unitId, data.businessDate, { lock: false });
    if (existing) return ok({ register: registerView(existing), alreadyOpen: true });
    const suggested = (await deps.registers.lastCounted(uow, data.unitId, data.businessDate)) ?? 0;
    const created = CashRegister.open({
      id: deps.newId(),
      organizationId: ctx.organizationId,
      unitId: data.unitId,
      businessDate: data.businessDate,
      currency: unit.value.currency,
      openingMinor: data.openingMinor,
      suggestedOpeningMinor: suggested,
      openingReason: data.openingReason,
      openedById: ctx.user.id,
      now,
    });
    if (!created.ok) return created;
    const register = created.value;
    if ((await deps.registers.insertIfAbsent(uow, register)) === "EXISTS") {
      // A simultaneous opening won the unique index: show its register.
      const winner = await deps.registers.findByUnitDay(uow, data.unitId, data.businessDate, { lock: false });
      return winner ? ok({ register: registerView(winner), alreadyOpen: true }) : fail(CashErrors.stale());
    }
    await uow.audit.record({
      action: "CREATE",
      entityType: "cash_register",
      entityId: register.id,
      summary: "Caixa aberto",
      changes: registerChanges(null, register.snapshot),
      metadata: {
        unitId: data.unitId,
        businessDate: data.businessDate,
        suggestedOpeningMinor: suggested,
        ...(data.openingReason ? { openingReason: data.openingReason } : {}),
      },
    });
    await uow.publish(
      cashEvent(
        CASH_EVENTS.registerOpened,
        {
          registerId: register.id,
          unitId: data.unitId,
          businessDate: data.businessDate,
          currency: unit.value.currency,
          actorUserId: ctx.user.id,
        },
        now,
      ),
    );
    return ok({ register: registerView(register), alreadyOpen: false });
  });
}

export type MovementResult = {
  movement: { id: string; direction: "IN" | "OUT"; amountMinor: number; createdAt: string };
};

// PRD F11: manual entries and withdrawals, refused on a closed register.
export async function recordMovement(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<MovementResult>> {
  const allowed = await authorize(ctx, "cash:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(recordMovementSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const now = deps.clock();
  const changed = await mutateRegister(deps, ctx, data.registerId, async (uow, register) => {
    const open = register.assertOpenForMovement();
    if (!open.ok) return open;
    // An entry uses revenue or transfer categories, a withdrawal expense or transfer ones.
    const category = await deps.reads.category(uow, data.categoryId);
    const kinds = data.direction === "IN" ? ["REVENUE", "TRANSFER"] : ["EXPENSE", "TRANSFER"];
    if (!category || !category.active || !kinds.includes(category.kind)) {
      return fail(CashErrors.categoryNotAllowed(data.direction));
    }
    if (data.attachmentId) {
      const attachment = await deps.reads.attachment(uow, data.attachmentId);
      if (!attachment || attachment.status !== "PENDING" || attachment.uploadedById !== ctx.user.id) {
        return fail(CashErrors.attachmentInvalid());
      }
    }
    const movementId = deps.newId();
    await deps.registers.insertMovement(uow, ctx.organizationId, {
      id: movementId,
      registerId: register.id,
      direction: data.direction,
      amountMinor: data.amountMinor,
      currency: register.snapshot.currency,
      description: data.description,
      categoryId: data.categoryId,
      attachmentId: data.attachmentId,
      createdById: ctx.user.id,
      createdAt: now,
    });
    await uow.audit.record({
      action: "CREATE",
      entityType: "cash_movement",
      entityId: movementId,
      summary: data.direction === "IN" ? "Entrada manual no caixa" : "Saída manual do caixa",
      metadata: {
        registerId: register.id,
        direction: data.direction,
        amountMinor: data.amountMinor,
        categoryId: data.categoryId,
      },
    });
    await uow.publish(
      cashEvent(
        CASH_EVENTS.movementRecorded,
        {
          movementId,
          registerId: register.id,
          unitId: register.snapshot.unitId,
          direction: data.direction,
          amountMinor: data.amountMinor,
          currency: register.snapshot.currency,
          actorUserId: ctx.user.id,
        },
        now,
      ),
    );
    return ok({
      id: movementId,
      direction: data.direction,
      amountMinor: data.amountMinor,
      createdAt: now.toISOString(),
    });
  });
  if (!changed.ok) return changed;
  return ok({ movement: changed.value.value });
}

// PRD F11 (interview): a movement is never edited or deleted; it is reversed with a reason.
export async function reverseMovement(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ reversed: true }>> {
  const allowed = await authorize(ctx, "cash:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(reverseMovementSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  if (data.reason.length < 10) return fail(CashErrors.reasonRequired());
  const now = deps.clock();
  const registerId = await withTransaction(ctx, async (uow) => {
    const movement = await deps.registers.findMovement(uow, data.movementId, { lock: false });
    return movement ? ok(movement.registerId) : fail(CashErrors.movementNotFound());
  });
  if (!registerId.ok) return registerId;
  const changed = await mutateRegister(deps, ctx, registerId.value, async (uow, register) => {
    const open = register.assertOpenForMovement();
    if (!open.ok) return open;
    const movement = await deps.registers.findMovement(uow, data.movementId, { lock: true });
    if (!movement) return fail(CashErrors.movementNotFound());
    if (movement.reversedAt) return fail(CashErrors.movementAlreadyReversed());
    await deps.registers.reverseMovement(uow, movement.id, {
      reason: data.reason,
      userId: ctx.user.id,
      at: now,
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "cash_movement",
      entityId: movement.id,
      summary: "Movimentação do caixa estornada",
      metadata: { registerId: register.id, reason: data.reason, amountMinor: movement.amountMinor },
    });
    await uow.publish(
      cashEvent(
        CASH_EVENTS.movementReversed,
        {
          movementId: movement.id,
          registerId: register.id,
          unitId: register.snapshot.unitId,
          direction: movement.direction,
          amountMinor: movement.amountMinor,
          currency: movement.currency,
          actorUserId: ctx.user.id,
        },
        now,
      ),
    );
    return ok(undefined);
  });
  if (!changed.ok) return changed;
  return ok({ reversed: true });
}

export type CloseResult = {
  closing: {
    sequence: number;
    expectedMinor: number;
    countedMinor: number;
    differenceMinor: number;
    byMethod: { method: string; receivedMinor: number; refundedMinor: number; netMinor: number }[];
  };
  register: RegisterView;
};

// PRD F11: closing freezes the register. The payments are read after the row lock is held, and
// the gate of F09 takes the same row FOR SHARE, so no payment can slip into a day being closed.
export async function closeRegister(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<CloseResult>> {
  const allowed = await authorize(ctx, "cash:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(closeRegisterSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const now = deps.clock();

  const changed = await mutateRegister(deps, ctx, data.registerId, async (uow, register) => {
    if (!register.isOpen) return fail(CashErrors.registerClosed());
    const unit = await loadUnit(deps, ctx, register.snapshot.unitId);
    if (!unit.ok) return unit;
    const window = dayWindow(register.snapshot.businessDate, unit.value.timeZone);
    const payments = await deps.billing.payments(ctx, {
      unitIds: [register.snapshot.unitId],
      currency: register.snapshot.currency,
      from: window.from,
      to: window.to,
    });
    if (!payments.ok) return payments;
    const movements = await deps.registers.movements(uow, register.id);
    const figures = dayFigures(register.snapshot.openingMinor, payments.value, movements);
    const closings = await deps.registers.closings(uow, register.id);
    const before = copyRegister(register);
    const closed = register.close({
      closingId: deps.newId(),
      nextSequence: closings.length + 1,
      expectedMinor: figures.expectedMinor,
      countedMinor: data.countedMinor,
      justification: data.justification,
      byMethod: figures.byMethod,
      movementsInMinor: figures.movementsInMinor,
      movementsOutMinor: figures.movementsOutMinor,
      userId: ctx.user.id,
      now,
      formatAmount: (minor) => moneyText(ctx, unit.value, minor),
    });
    if (!closed.ok) return closed;
    await uow.audit.record({
      action: "UPDATE",
      entityType: "cash_register",
      entityId: register.id,
      summary: "Caixa fechado",
      changes: registerChanges(before, register.snapshot),
      metadata: {
        sequence: closed.value.sequence,
        expectedMinor: closed.value.expectedMinor,
        countedMinor: closed.value.countedMinor,
        differenceMinor: closed.value.differenceMinor,
      },
    });
    await uow.publish(
      cashEvent(
        CASH_EVENTS.registerClosed,
        {
          registerId: register.id,
          unitId: register.snapshot.unitId,
          businessDate: register.snapshot.businessDate,
          currency: register.snapshot.currency,
          actorUserId: ctx.user.id,
          expectedMinor: closed.value.expectedMinor,
          countedMinor: closed.value.countedMinor,
          differenceMinor: closed.value.differenceMinor,
        },
        now,
      ),
    );
    return ok(closed.value);
  });
  if (!changed.ok) return changed;
  const closing = changed.value.value;
  return ok({
    closing: {
      sequence: closing.sequence,
      expectedMinor: closing.expectedMinor,
      countedMinor: closing.countedMinor,
      differenceMinor: closing.differenceMinor,
      byMethod: closing.byMethod,
    },
    register: registerView(changed.value.register),
  });
}

// PRD F11: only Manager and Administrator reopen, with a reason; both closings stay in history.
export async function reopenRegister(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ register: RegisterView }>> {
  const allowed = await authorize(ctx, "cash:reopen");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(reopenRegisterSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const now = deps.clock();
  const changed = await mutateRegister(deps, ctx, data.registerId, async (uow, register) => {
    if (register.isOpen) return fail(CashErrors.registerAlreadyOpen());
    const closings = await deps.registers.closings(uow, register.id);
    const last = closings[closings.length - 1];
    if (!last) return fail(CashErrors.registerNotOpen());
    const before = copyRegister(register);
    const reopened = register.reopen({
      reopeningId: deps.newId(),
      lastClosingId: last.id,
      reason: data.reason,
      userId: ctx.user.id,
      now,
    });
    if (!reopened.ok) return reopened;
    await uow.audit.record({
      action: "UPDATE",
      entityType: "cash_register",
      entityId: register.id,
      summary: "Caixa reaberto",
      changes: registerChanges(before, register.snapshot),
      metadata: { reason: data.reason, closingId: last.id },
    });
    await uow.publish(
      cashEvent(
        CASH_EVENTS.registerReopened,
        {
          registerId: register.id,
          unitId: register.snapshot.unitId,
          businessDate: register.snapshot.businessDate,
          currency: register.snapshot.currency,
          actorUserId: ctx.user.id,
        },
        now,
      ),
    );
    return ok(undefined);
  });
  if (!changed.ok) return changed;
  return ok({ register: registerView(changed.value.register) });
}
