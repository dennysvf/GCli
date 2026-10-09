import type { PackageLinkLookup } from "../application/ports";

// Inert default until packages (F10) registers its implementation (ADR-007, ADR-022).
export const noPackageLinks: PackageLinkLookup = {
  linkStates: () => Promise.resolve(new Map()),
};
