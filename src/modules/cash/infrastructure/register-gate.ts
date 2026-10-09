import type { CashRegisterGate } from "@/modules/billing";
import { dateInTimeZone } from "@/shared/kernel/time-zones";

// The gate billing calls inside every payment and refund (ADR-036). It takes the register row
// FOR SHARE, so closing (FOR UPDATE) and a payment of the same day serialize, while payments do not
// block each other. A day with no register is not closed.
export const cashRegisterGate: CashRegisterGate = {
  async isClosed(uow, input) {
    const unit = await uow.tx.unit.findFirst({ where: { id: input.unitId }, select: { timeZone: true } });
    if (!unit) return false;
    const businessDate = dateInTimeZone(input.at, unit.timeZone);
    const found = await uow.tx.cashRegister.findFirst({
      where: { unitId: input.unitId, businessDate: new Date(`${businessDate}T00:00:00Z`) },
      select: { id: true },
    });
    if (!found) return false;
    const rows = await uow.tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM cash_register WHERE id = ${found.id}::uuid FOR SHARE`;
    return rows[0]?.status === "CLOSED";
  },
};
