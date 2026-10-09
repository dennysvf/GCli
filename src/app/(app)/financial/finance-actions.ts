import type { FinanceActions } from "@/modules/cash/client";
import { downloadUrlAction, uploadIntentAction, categoriesAction } from "./cash-server";
import {
  createEntryAction,
  deleteEntryAction,
  endSeriesAction,
  listEntriesAction,
  payEntryAction,
  reverseEntryPaymentAction,
  saveCategoryAction,
  setCategoryActiveAction,
  statementAction,
  updateEntryAction,
} from "./finance-server";

// The Server Actions the expenses, revenues, statement and categories screens receive as props.
export const financeActions = {
  createEntry: createEntryAction,
  updateEntry: updateEntryAction,
  deleteEntry: deleteEntryAction,
  payEntry: payEntryAction,
  reverseEntryPayment: reverseEntryPaymentAction,
  endSeries: endSeriesAction,
  listEntries: listEntriesAction,
  statement: statementAction,
  categories: categoriesAction,
  saveCategory: saveCategoryAction,
  setCategoryActive: setCategoryActiveAction,
  uploadIntent: uploadIntentAction,
  downloadUrl: downloadUrlAction,
} as unknown as FinanceActions;
