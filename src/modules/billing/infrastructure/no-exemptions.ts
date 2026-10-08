import type { ChargeExemptionPolicy } from "../application/ports";

// Default until packages (F10) register their policy (ADR-007): nothing is exempt from a charge.
export const noExemptions: ChargeExemptionPolicy = {
  async isExempt() {
    return false;
  },
};
