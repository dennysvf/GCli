"use server";

import { withRequestContext } from "@/modules/identity/next";
import { professionals, professionalsMessages } from "@/modules/professionals";
import { toActionResult } from "@/shared/kernel/action-result";

// Creates or updates depending on professionalId, so the Dados form uses one action for both.
export async function saveProfessionalAction(input: Record<string, unknown>) {
  return withRequestContext(async (ctx) =>
    toActionResult(
      await (input.professionalId
        ? professionals.updateProfessional(ctx, input)
        : professionals.createProfessional(ctx, input)),
      professionalsMessages,
    ),
  );
}

export async function setProfessionalActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await professionals.setProfessionalActive(ctx, input), professionalsMessages),
  );
}

export async function replaceEnabledServicesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await professionals.replaceEnabledServices(ctx, input), professionalsMessages),
  );
}

export async function saveScheduleAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await professionals.saveSchedule(ctx, input), professionalsMessages),
  );
}

export async function deleteScheduleAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await professionals.deleteSchedule(ctx, input), professionalsMessages),
  );
}

export async function createTimeOffAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await professionals.createTimeOff(ctx, input), professionalsMessages),
  );
}

export async function deleteTimeOffAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await professionals.deleteTimeOff(ctx, input), professionalsMessages),
  );
}
