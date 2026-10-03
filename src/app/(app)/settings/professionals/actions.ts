"use server";

import { withRequestContext } from "@/modules/identity/next";
import { professionals } from "@/modules/professionals";
import { toActionResult } from "@/shared/kernel/action-result";

// Creates or updates depending on professionalId, so the Dados form uses one action for both.
export async function saveProfessionalAction(input: Record<string, unknown>) {
  return withRequestContext(async (ctx) =>
    toActionResult(
      await (input.professionalId
        ? professionals.updateProfessional(ctx, input)
        : professionals.createProfessional(ctx, input)),
      ctx.locale,
      "professionals",
    ),
  );
}

export async function setProfessionalActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await professionals.setProfessionalActive(ctx, input), ctx.locale, "professionals"),
  );
}

export async function replaceEnabledServicesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await professionals.replaceEnabledServices(ctx, input), ctx.locale, "professionals"),
  );
}

export async function saveScheduleAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await professionals.saveSchedule(ctx, input), ctx.locale, "professionals"),
  );
}

export async function deleteScheduleAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await professionals.deleteSchedule(ctx, input), ctx.locale, "professionals"),
  );
}

export async function createTimeOffAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await professionals.createTimeOff(ctx, input), ctx.locale, "professionals"),
  );
}

export async function deleteTimeOffAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await professionals.deleteTimeOff(ctx, input), ctx.locale, "professionals"),
  );
}
