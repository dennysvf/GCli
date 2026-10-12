import { getOrganizationProfile, identity } from "@/modules/identity";
import type { OrganizationHeaderLookup } from "../application/ports";

// Reads the organization profile and logo through the identity public API, as the F06 agenda PDF
// does (PRD F13 Consumes: F01 trade name and logo). Failures become an empty header.
export const identityOrganizationHeader: OrganizationHeaderLookup = {
  async header(ctx) {
    const [profile, logo] = await Promise.all([
      getOrganizationProfile(ctx),
      identity.getOrganizationLogo(ctx),
    ]);
    const value = profile.ok ? profile.value : null;
    return {
      name: value?.tradeName ?? value?.legalName ?? "",
      // The logo is stored as PNG (F01 logo processor).
      logo: logo.ok && logo.value ? { data: Buffer.from(logo.value.body), format: "png" } : null,
    };
  },
};
