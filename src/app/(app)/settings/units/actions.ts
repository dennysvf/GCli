"use server";

import { units, unitsMessages } from "@/modules/units";
import { withRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

export async function createUnitAction(input: unknown) {
  return withRequestContext(async (ctx) => toActionResult(await units.createUnit(ctx, input), unitsMessages));
}

export async function updateUnitAction(input: unknown) {
  return withRequestContext(async (ctx) => toActionResult(await units.updateUnit(ctx, input), unitsMessages));
}

export async function setUnitActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await units.setUnitActive(ctx, input), unitsMessages),
  );
}

export async function replaceBusinessHoursAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await units.replaceBusinessHours(ctx, input), unitsMessages),
  );
}

export async function createRoomAction(input: unknown) {
  return withRequestContext(async (ctx) => toActionResult(await units.createRoom(ctx, input), unitsMessages));
}

export async function updateRoomAction(input: unknown) {
  return withRequestContext(async (ctx) => toActionResult(await units.updateRoom(ctx, input), unitsMessages));
}

export async function setRoomActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await units.setRoomActive(ctx, input), unitsMessages),
  );
}

export async function createClosureAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await units.createClosure(ctx, input), unitsMessages),
  );
}

export async function deleteClosureAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await units.deleteClosure(ctx, input), unitsMessages),
  );
}

export async function selectUnitAction(input: unknown) {
  return withRequestContext(async (ctx) => toActionResult(await units.selectUnit(ctx, input), unitsMessages));
}
