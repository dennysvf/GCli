// Public API of the packages module (spec F10 section 5). Use cases are wired here with their
// infrastructure adapters; callers never import files inside the module.
import { billing } from "@/modules/billing";
import { scheduling } from "@/modules/scheduling";
import type { RequestContext } from "@/shared/context/types";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { EventBus } from "@/shared/events/event-bus";
import { newId } from "@/shared/kernel/ids";
import { subscribePackagesEvents as subscribe } from "./application/appointment-handlers";
import { cancelPackage, expirePackages, extendPackage } from "./application/lifecycle";
import type { PackagesDeps } from "./application/ports";
import { eligiblePackages, listPatientPackages, seriesCoverage } from "./application/queries";
import { sellPackage } from "./application/sales";
import {
  getNoShowDebit,
  listTemplates,
  saveTemplate,
  setNoShowDebit,
  setTemplateActive,
} from "./application/templates";
import { billingGateway } from "./infrastructure/billing-gateway";
import { packagesDirectory } from "./infrastructure/directory";
import { packagesExemptionPolicy } from "./infrastructure/exemption-policy";
import { packageLinkLookup } from "./infrastructure/link-lookup";
import { prismaPackageRepository } from "./infrastructure/prisma-package-repository";

const baseDeps: PackagesDeps = {
  packages: prismaPackageRepository,
  directory: packagesDirectory,
  billing: billingGateway,
  clock: () => new Date(),
  newId,
};

// The use cases bound to their dependencies. `adjust` lets tests replace an adapter (a billing
// gateway that fails, a clock) while the rest stays real.
export function createPackages(adjust?: (base: PackagesDeps) => PackagesDeps) {
  const deps = adjust ? adjust(baseDeps) : baseDeps;
  return {
    // Templates and settings
    listTemplates: (ctx: RequestContext, input?: unknown) => listTemplates(deps, ctx, input),
    saveTemplate: (ctx: RequestContext, input: unknown) => saveTemplate(deps, ctx, input),
    setTemplateActive: (ctx: RequestContext, input: unknown) => setTemplateActive(deps, ctx, input),
    getNoShowDebit: (ctx: RequestContext) => getNoShowDebit(ctx),
    setNoShowDebit: (ctx: RequestContext, input: unknown) => setNoShowDebit(deps, ctx, input),
    // Sale and lifecycle
    sellPackage: (ctx: RequestContext, input: unknown) => sellPackage(deps, ctx, input),
    extendPackage: (ctx: RequestContext, input: unknown) => extendPackage(deps, ctx, input),
    cancelPackage: (ctx: RequestContext, input: unknown) => cancelPackage(deps, ctx, input),
    // Reads
    eligiblePackages: (ctx: RequestContext, input: unknown) => eligiblePackages(deps, ctx, input),
    seriesCoverage: (ctx: RequestContext, input: unknown) => seriesCoverage(deps, ctx, input),
    listPatientPackages: (ctx: RequestContext, input: unknown) => listPatientPackages(deps, ctx, input),
    // Worker
    expirePackages: (input: { organizationId: string; timeZone: string; now?: Date }) =>
      expirePackages(deps, input),
  };
}

export const packages = createPackages();

// Wired by the composition root: the scheduling events, billing's exemption policy and the agenda mark.
export function subscribePackagesEvents(bus: EventBus<UnitOfWork>): void {
  subscribe(bus, baseDeps);
}

export function registerPackagesPorts(): void {
  billing.registerChargeExemptionPolicy(packagesExemptionPolicy);
  scheduling.registerPackageLinkLookup(packageLinkLookup);
}

export { packagesCatalog } from "./messages/catalog";
export { PACKAGES_EVENTS, type PackageEventPayload } from "./domain/events";
export type { CancelResult } from "./application/lifecycle";
export type { EligiblePackage, PatientPackages } from "./application/queries";
export type { SaleResult } from "./application/sales";
export type { TemplateItem } from "./application/templates";
export type { PackageCard, PackageLinkView, PackageView } from "./application/views";
export type { PackagesDeps } from "./application/ports";
