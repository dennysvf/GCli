"use server";

import { withRequestContext } from "@/modules/identity/next";
import { scheduling, schedulingMessages } from "@/modules/scheduling";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Actions of the agenda (spec F06 section 5). Reads for polling go through the GET routes
// under /api/schedule; changes come here.

export async function bookAppointmentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.bookAppointment(ctx, input), schedulingMessages),
  );
}

export async function previewSeriesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.previewSeries(ctx, input), schedulingMessages),
  );
}

export async function bookSeriesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.bookSeries(ctx, input), schedulingMessages),
  );
}

export async function updateAppointmentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.updateAppointment(ctx, input), schedulingMessages),
  );
}

export async function rescheduleAppointmentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.rescheduleAppointment(ctx, input), schedulingMessages),
  );
}

export async function changeStatusAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.changeAppointmentStatus(ctx, input), schedulingMessages),
  );
}

export async function cancelAppointmentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.cancelAppointment(ctx, input), schedulingMessages),
  );
}

export async function previewSeriesEditAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.previewSeriesEdit(ctx, input), schedulingMessages),
  );
}

export async function editSeriesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.editSeries(ctx, input), schedulingMessages),
  );
}

export async function getAppointmentAction(appointmentId: string) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.getAppointment(ctx, appointmentId), schedulingMessages),
  );
}

export async function bookingOptionsAction(input: { unitId: string; serviceId: string }) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.getBookingOptions(ctx, input), schedulingMessages),
  );
}
