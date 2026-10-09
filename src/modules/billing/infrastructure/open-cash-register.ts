import type { CashRegisterGate } from "../application/ports";

// Default until the cash register (F11) registers its gate (ADR-036): no day is closed.
export const openCashRegister: CashRegisterGate = {
  async isClosed() {
    return false;
  },
};
