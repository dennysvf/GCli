"use server";

import { withRequestContext } from "@/modules/identity/next";
import { scheduling } from "@/modules/scheduling";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Actions of the agenda (spec F06 section 5). Reads for polling go through the GET routes
// under /api/schedule; changes come here.

export async function bookAppointmentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.bookAppointment(ctx, input), ctx.locale, "scheduling"),
  );
}

export async function previewSeriesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.previewSeries(ctx, input), ctx.locale, "scheduling"),
  );
}

export async function bookSeriesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.bookSeries(ctx, input), ctx.locale, "scheduling"),
  );
}

export async function updateAppointmentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.updateAppointment(ctx, input), ctx.locale, "scheduling"),
  );
}

export async function rescheduleAppointmentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.rescheduleAppointment(ctx, input), ctx.locale, "scheduling"),
  );
}

export async function changeStatusAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.changeAppointmentStatus(ctx, input), ctx.locale, "scheduling"),
  );
}

export async function cancelAppointmentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.cancelAppointment(ctx, input), ctx.locale, "scheduling"),
  );
}

export async function previewSeriesEditAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.previewSeriesEdit(ctx, input), ctx.locale, "scheduling"),
  );
}

export async function editSeriesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.editSeries(ctx, input), ctx.locale, "scheduling"),
  );
}

export async function getAppointmentAction(appointmentId: string) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.getAppointment(ctx, appointmentId), ctx.locale, "scheduling"),
  );
}

export async function bookingOptionsAction(input: { unitId: string; serviceId: string }) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.getBookingOptions(ctx, input), ctx.locale, "scheduling"),
  );
}
