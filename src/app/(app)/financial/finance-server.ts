"use server";

import { cash } from "@/modules/cash";
import { withRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Actions of expenses, revenues, the statement and the categories (spec F11 section 5).
export async function createEntryAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.createEntry(ctx, input), ctx.locale, "cash"),
  );
}

export async function updateEntryAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.updateEntry(ctx, input), ctx.locale, "cash"),
  );
}

export async function deleteEntryAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.deleteEntry(ctx, input), ctx.locale, "cash"),
  );
}

export async function payEntryAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.payEntry(ctx, input), ctx.locale, "cash"),
  );
}

export async function reverseEntryPaymentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.reverseEntryPayment(ctx, input), ctx.locale, "cash"),
  );
}

export async function endSeriesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.endSeries(ctx, input), ctx.locale, "cash"),
  );
}

export async function listEntriesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.listEntries(ctx, input), ctx.locale, "cash"),
  );
}

export async function statementAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.getStatement(ctx, input), ctx.locale, "cash"),
  );
}

export async function saveCategoryAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.saveCategory(ctx, input), ctx.locale, "cash"),
  );
}

export async function setCategoryActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.setCategoryActive(ctx, input), ctx.locale, "cash"),
  );
}
