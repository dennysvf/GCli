"use server";

import { documents } from "@/modules/documents";
import { withRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Actions of the Documents settings (spec F08 section 5): categories and templates.

export async function createCategoryAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.createCategory(ctx, input), ctx.locale, "documents"),
  );
}

export async function updateCategoryAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.updateCategory(ctx, input), ctx.locale, "documents"),
  );
}

export async function setCategoryActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.setCategoryActive(ctx, input), ctx.locale, "documents"),
  );
}

export async function createTemplateAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.createTemplate(ctx, input), ctx.locale, "documents"),
  );
}

export async function updateTemplateAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.updateTemplate(ctx, input), ctx.locale, "documents"),
  );
}

export async function setTemplateActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.setTemplateActive(ctx, input), ctx.locale, "documents"),
  );
}
