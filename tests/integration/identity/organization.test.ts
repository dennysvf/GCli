import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getOrganizationProfile, identity } from "@/modules/identity";
import { db } from "@/shared/db/client";
import { objectStorage } from "@/shared/storage/object-storage";
import {
  auditEvents,
  closeHelpers,
  createOrganization,
  createUser,
  resetDatabase,
  signedInContext,
} from "../helpers";

let orgId: string;

beforeEach(async () => {
  await resetDatabase();
  orgId = await createOrganization();
});
afterAll(closeHelpers);

async function adminContext() {
  const admin = await createUser({ organizationId: orgId, role: "ADMINISTRATOR" });
  return (await signedInContext(admin)).ctx;
}

const baseInput = {
  legalName: "Clínica Exemplo Ltda",
  tradeName: "Clínica Exemplo",
  country: "BR",
  defaultLocale: "pt-BR",
  timeZone: "America/Sao_Paulo",
  slotGranularityMinutes: 15,
  version: 1,
};

async function png(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: "#336699" } })
      .png()
      .toBuffer(),
  );
}

describe("organization settings", () => {
  it("F01: administrator saves settings with a valid tax ID and the change is audited", async () => {
    const ctx = await adminContext();
    const result = await identity.updateOrganization(ctx, { ...baseInput, taxId: "12.ABC.345/01DE-35" });
    expect(result).toEqual({ ok: true, value: { version: 2 } });
    const org = await db().organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.taxId).toBe("12ABC34501DE35");
    const [event] = await auditEvents({ action: "UPDATE", entityId: orgId });
    expect(event?.changes).toMatchObject({ taxId: { before: null, after: "12ABC34501DE35" } });
  });

  it("F01: an invalid tax ID is rejected with an inline error", async () => {
    const ctx = await adminContext();
    const result = await identity.updateOrganization(ctx, { ...baseInput, taxId: "11.222.333/0001-82" });
    expect(!result.ok && result.error).toMatchObject({
      code: "TAX_ID_INVALID",
      fields: { taxId: "errors.TAX_ID_INVALID" },
      params: { type: "CNPJ" },
    });
    expect((await db().organization.findUniqueOrThrow({ where: { id: orgId } })).version).toBe(1);
  });

  it("F01: a stale version is rejected", async () => {
    const ctx = await adminContext();
    expect((await identity.updateOrganization(ctx, baseInput)).ok).toBe(true);
    const stale = await identity.updateOrganization(ctx, { ...baseInput, legalName: "Outra" });
    expect(!stale.ok && stale.error.code).toBe("CONFLICT_STALE_VERSION");
  });

  it("F01: uploading a logo does not invalidate an open settings form", async () => {
    const ctx = await adminContext();
    await identity.uploadOrganizationLogo(ctx, { bytes: await png(100, 40), type: "image/png" });
    expect((await identity.updateOrganization(ctx, baseInput)).ok).toBe(true);
  });

  it("F01: only administrators can update the organization", async () => {
    const manager = await createUser({ organizationId: orgId, role: "MANAGER" });
    const { ctx } = await signedInContext(manager);
    const result = await identity.updateOrganization(ctx, baseInput);
    expect(!result.ok && result.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("F01: logo is rasterized to PNG within 400×160 and served", async () => {
    const ctx = await adminContext();
    const uploaded = await identity.uploadOrganizationLogo(ctx, {
      bytes: await png(1200, 300),
      type: "image/png",
    });
    expect(uploaded.ok && uploaded.value.logoUrl).toBe("/api/organization/logo?v=1");
    const logo = await identity.getOrganizationLogo(ctx);
    if (!logo.ok || !logo.value) throw new Error("logo missing");
    const meta = await sharp(Buffer.from(logo.value.body)).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeLessThanOrEqual(400);
    expect(meta.height).toBeLessThanOrEqual(160);
  });

  it("F01: SVG logos are converted to PNG", async () => {
    const ctx = await adminContext();
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><script>alert(1)</script><rect width="200" height="80" fill="#123"/></svg>',
    );
    const uploaded = await identity.uploadOrganizationLogo(ctx, { bytes: svg, type: "image/svg+xml" });
    expect(uploaded.ok).toBe(true);
    const logo = await identity.getOrganizationLogo(ctx);
    expect(logo.ok && logo.value && (await sharp(Buffer.from(logo.value.body)).metadata()).format).toBe(
      "png",
    );
  });

  it("F01: logo above 2 MB or unsupported type is rejected", async () => {
    const ctx = await adminContext();
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set([0x89, 0x50, 0x4e, 0x47]);
    const tooBig = await identity.uploadOrganizationLogo(ctx, { bytes: big, type: "image/png" });
    expect(!tooBig.ok && tooBig.error.code).toBe("ORG_LOGO_INVALID");
    const gif = await identity.uploadOrganizationLogo(ctx, {
      bytes: new TextEncoder().encode("GIF89a..."),
      type: "image/gif",
    });
    expect(!gif.ok && gif.error.code).toBe("ORG_LOGO_INVALID");
    const mismatch = await identity.uploadOrganizationLogo(ctx, {
      bytes: await png(10, 10),
      type: "image/jpeg",
    });
    expect(!mismatch.ok && mismatch.error.code).toBe("ORG_LOGO_INVALID");
    const org = await db().organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.logoObjectKey).toBeNull();
  });

  it("F01: replacing the logo removes the previous object", async () => {
    const ctx = await adminContext();
    await identity.uploadOrganizationLogo(ctx, { bytes: await png(100, 40), type: "image/png" });
    const first = (await db().organization.findUniqueOrThrow({ where: { id: orgId } })).logoObjectKey;
    await identity.uploadOrganizationLogo(ctx, { bytes: await png(120, 40), type: "image/png" });
    expect(first && (await objectStorage().get(first))).toBeNull();
  });
});

describe("provided to other features", () => {
  it("F01→F08/F13: getOrganizationProfile returns name, tax ID, country, logo URL and time zone", async () => {
    const ctx = await adminContext();
    await identity.updateOrganization(ctx, { ...baseInput, taxId: "11.222.333/0001-81" });
    await identity.uploadOrganizationLogo(ctx, { bytes: await png(100, 40), type: "image/png" });
    const desk = await createUser({ organizationId: orgId, role: "FRONT_DESK" });
    const profile = await getOrganizationProfile((await signedInContext(desk)).ctx);
    expect(profile).toEqual({
      ok: true,
      value: {
        legalName: "Clínica Exemplo Ltda",
        tradeName: "Clínica Exemplo",
        taxId: "11222333000181",
        country: "BR",
        defaultLocale: "pt-BR",
        logoUrl: "/api/organization/logo?v=1",
        timeZone: "America/Sao_Paulo",
        slotGranularityMinutes: 15,
        version: 2,
      },
    });
  });
});
