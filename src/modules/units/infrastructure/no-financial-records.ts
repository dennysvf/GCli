import type { UnitFinancialRecords } from "../application/ports";

// Default until billing (F09) registers its implementation (ADR-007): no unit has charges.
export const noFinancialRecords: UnitFinancialRecords = {
  async hasAnyInUnit() {
    return false;
  },
};
