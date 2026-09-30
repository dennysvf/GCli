"use server";

import { withRequestContext } from "@/modules/identity/next";
import { services, servicesMessages } from "@/modules/services";
import { toActionResult } from "@/shared/kernel/action-result";

// Creates or updates depending on serviceId, so the side panel uses one action for both.
export async function saveServiceAction(input: Record<string, unknown>) {
  return withRequestContext(async (ctx) =>
    toActionResult(
      await (input.serviceId ? services.updateService(ctx, input) : services.createService(ctx, input)),
      servicesMessages,
    ),
  );
}

export async function setServiceActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await services.setServiceActive(ctx, input), servicesMessages),
  );
}

export async function createCategoryAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await services.createCategory(ctx, input), servicesMessages),
  );
}

export async function renameCategoryAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await services.renameCategory(ctx, input), servicesMessages),
  );
}

export async function moveCategoryAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await services.moveCategory(ctx, input), servicesMessages),
  );
}

export async function deleteCategoryAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await services.deleteCategory(ctx, input), servicesMessages),
  );
}
