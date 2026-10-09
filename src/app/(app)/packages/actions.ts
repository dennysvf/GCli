"use server";

import { withRequestContext } from "@/modules/identity/next";
import { packages } from "@/modules/packages";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Actions of packages (spec F10 section 5). Each one only translates the result:
// authorization, validation, audit and events live in the use cases.
export async function sellOptionsAction() {
  return withRequestContext(async (ctx) =>
    toActionResult(await packages.getSellOptions(ctx), ctx.locale, "packages"),
  );
}

export async function sellPackageAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await packages.sellPackage(ctx, input), ctx.locale, "packages"),
  );
}

export async function patientPackagesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await packages.listPatientPackages(ctx, input), ctx.locale, "packages"),
  );
}

export async function extendPackageAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await packages.extendPackage(ctx, input), ctx.locale, "packages"),
  );
}

export async function cancelPackageAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await packages.cancelPackage(ctx, input), ctx.locale, "packages"),
  );
}

export async function eligiblePackagesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await packages.eligiblePackages(ctx, input), ctx.locale, "packages"),
  );
}

export async function seriesCoverageAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await packages.seriesCoverage(ctx, input), ctx.locale, "packages"),
  );
}

export async function saveTemplateAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await packages.saveTemplate(ctx, input), ctx.locale, "packages"),
  );
}

export async function setTemplateActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await packages.setTemplateActive(ctx, input), ctx.locale, "packages"),
  );
}

export async function setNoShowDebitAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await packages.setNoShowDebit(ctx, input), ctx.locale, "packages"),
  );
}
