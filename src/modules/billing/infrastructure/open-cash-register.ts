import { ok } from "@/shared/kernel/result";
import type { CashRegisterGate } from "../application/ports";

// Default until the cash register (F11) registers its gate (ADR-007): every day is open.
export const openCashRegister: CashRegisterGate = {
  async assertOpen() {
    return ok(undefined);
  },
};
