import type { CashActions } from "@/modules/cash/client";
import {
  categoriesAction,
  closeRegisterAction,
  downloadUrlAction,
  openRegisterAction,
  recordMovementAction,
  registerDayAction,
  reopenRegisterAction,
  reverseMovementAction,
  uploadIntentAction,
} from "./cash-server";

// The Server Actions the cash register screen receives as props (the module's UI never imports `app/`).
export const cashActions = {
  registerDay: registerDayAction,
  open: openRegisterAction,
  recordMovement: recordMovementAction,
  reverseMovement: reverseMovementAction,
  close: closeRegisterAction,
  reopen: reopenRegisterAction,
  categories: categoriesAction,
  uploadIntent: uploadIntentAction,
  downloadUrl: downloadUrlAction,
} as unknown as CashActions;
