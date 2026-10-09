import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  billingWorld,
  categoryId,
  mustClose,
  mustMove,
  mustOpen,
  REASON,
  today,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

describe("cash schema", () => {
  it("F11: the database refuses a second register, a closing without justification, and deletes", async () => {
    const register = await mustOpen(world);
    const date = await today(world);
    await expect(
      db().cashRegister.create({
        data: {
          id: newId(),
          organizationId: world.organizationId,
          unitId: world.unitId,
          businessDate: new Date(`${date}T00:00:00Z`),
          currency: "BRL",
          openingMinor: 0n,
          suggestedOpeningMinor: 0n,
          openedById: world.desk.user.id,
        },
      }),
    ).rejects.toThrow(/uq_cash_register_unit_day/);

    await expect(
      db().cashRegisterClosing.create({
        data: {
          id: newId(),
          organizationId: world.organizationId,
          registerId: register.id,
          sequence: 1,
          expectedMinor: 10_000n,
          countedMinor: 8_000n,
          differenceMinor: -2_000n,
          justification: "curto",
          byMethod: [],
          movementsInMinor: 0n,
          movementsOutMinor: 0n,
          wasFlaggedUnclosed: false,
          closedById: world.desk.user.id,
        },
      }),
    ).rejects.toThrow(/ck_cash_closing_justification/);

    await mustMove(world, register.id, "OUT", 1_000);
    await expect(db().cashMovement.deleteMany()).rejects.toThrow(/permission denied/);
    await expect(db().cashRegister.deleteMany()).rejects.toThrow(/permission denied/);
  });

  it("F11: closings and reopenings are immutable and movements keep their reversal in one piece", async () => {
    const register = await mustOpen(world, { openingMinor: 5_000, openingReason: REASON });
    const movement = await mustMove(world, register.id, "OUT", 1_000);
    await mustClose(world, register.id, 3_000, REASON);
    await expect(db().cashRegisterClosing.updateMany({ data: { countedMinor: 0n } })).rejects.toThrow(
      /permission denied/,
    );
    await expect(db().cashRegisterClosing.deleteMany()).rejects.toThrow(/permission denied/);
    await expect(
      db().cashMovement.update({ where: { id: movement.id }, data: { reversedAt: new Date() } }),
    ).rejects.toThrow(/ck_cash_movement_reversal/);
    await expect(
      db().cashMovement.update({ where: { id: movement.id }, data: { amountMinor: 0n } }),
    ).rejects.toThrow(/ck_cash_movement_amount/);
  });

  it("F11: entries keep their payment history and are only deleted while pending", async () => {
    const category = await categoryId(world, "EXPENSE");
    const entryId = newId();
    await db().financialEntry.create({
      data: {
        id: entryId,
        organizationId: world.organizationId,
        kind: "EXPENSE",
        description: "Material",
        categoryId: category,
        currency: "BRL",
        amountMinor: 5_000n,
        dueDate: new Date("2030-01-10T00:00:00Z"),
        status: "PAID",
        createdById: world.manager.user.id,
      },
    });
    await expect(
      db().financialEntry.update({ where: { id: entryId }, data: { deletedAt: new Date() } }),
    ).rejects.toThrow(/ck_financial_entry_deleted/);
    await expect(db().financialEntry.deleteMany()).rejects.toThrow(/permission denied/);

    const paymentData = {
      organizationId: world.organizationId,
      entryId,
      paidOn: new Date("2030-01-10T00:00:00Z"),
      method: "PIX",
      amountMinor: 5_000n,
      currency: "BRL",
      recordedById: world.manager.user.id,
    };
    await db().financialEntryPayment.create({ data: { id: newId(), ...paymentData } });
    await expect(
      db().financialEntryPayment.create({ data: { id: newId(), ...paymentData } }),
    ).rejects.toThrow(/uq_financial_entry_payment_live/);
    await expect(db().financialEntryPayment.deleteMany()).rejects.toThrow(/permission denied/);
  });
});
