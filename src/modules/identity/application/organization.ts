import { authorize } from "@/shared/authz/guard";
import { diffChanges } from "@/shared/audit/diff";
import type { RequestContext, SystemContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { isValidCnpj, normalizeCnpj } from "@/shared/kernel/cnpj";
import { LOGO_MAX_BYTES, LOGO_MAX_HEIGHT, LOGO_MAX_WIDTH } from "../domain/policies";
import { IdentityErrors } from "./errors";
import { createInvitation } from "./invitations";
import type { IdentityDeps } from "./ports";
import { emailSchema, updateOrganizationSchema } from "./schemas";
import { z } from "zod";

export type OrganizationProfile = {
  legalName: string;
  tradeName: string | null;
  cnpj: string | null;
  logoUrl: string | null;
  timeZone: string;
  slotGranularityMinutes: number;
  version: number;
};

// Provided to F08 and F13 (PRD F01 Provides).
export async function getOrganizationProfile(ctx: RequestContext): Promise<Result<OrganizationProfile>> {
  const allowed = await authorize(ctx, "organization:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const org = await uow.tx.organization.findFirst({});
    if (!org) return fail(CommonErrors.notFound());
    return ok({
      legalName: org.legalName,
      tradeName: org.tradeName,
      cnpj: org.cnpj,
      logoUrl: org.logoObjectKey ? `/api/organization/logo?v=${org.logoVersion}` : null,
      timeZone: org.timeZone,
      slotGranularityMinutes: org.slotGranularityMinutes,
      version: org.version,
    });
  });
}

export async function updateOrganization(
  deps: IdentityDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ version: number }>> {
  const allowed = await authorize(ctx, "organization:update");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(updateOrganizationSchema, input);
  if (!parsed.ok) return parsed;
  const { version, ...data } = parsed.value;
  if (data.cnpj && !isValidCnpj(data.cnpj)) return fail(IdentityErrors.invalidCnpj());

  return withTransaction(ctx, async (uow) => {
    const before = await uow.tx.organization.findFirst({});
    if (!before) return fail(CommonErrors.notFound());
    // Optimistic lock: only the version the user edited may be overwritten.
    const updated = await uow.tx.organization.updateMany({
      where: { version },
      data: { ...data, version: { increment: 1 }, updatedById: ctx.user.id },
    });
    if (updated.count !== 1) return fail(CommonErrors.staleVersion());
    await uow.audit.record({
      action: "UPDATE",
      entityType: "organization",
      entityId: ctx.organizationId,
      summary: "Configurações da organização alteradas",
      changes: diffChanges(before, data),
    });
    return ok({ version: version + 1 });
  });
}

type LogoFormat = "png" | "jpeg" | "svg";

// Content sniffing: the declared type must match the file's real format.
function sniff(bytes: Uint8Array): LogoFormat | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const head = new TextDecoder().decode(bytes.slice(0, 1024)).replace(/^﻿/, "").trimStart();
  if (
    (head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!--")) &&
    head.includes("<svg")
  ) {
    return "svg";
  }
  return null;
}

const DECLARED: Record<string, LogoFormat> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/svg+xml": "svg",
};

// The logo has its own logoVersion, so uploading or removing it does not conflict with an open
// settings form (the form only locks on `version`).
export async function uploadOrganizationLogo(
  deps: IdentityDeps,
  ctx: RequestContext,
  file: { bytes: Uint8Array; type: string },
): Promise<Result<{ logoUrl: string }>> {
  const allowed = await authorize(ctx, "organization:update");
  if (!allowed.ok) return allowed;
  const format = sniff(file.bytes);
  if (
    file.bytes.byteLength === 0 ||
    file.bytes.byteLength > LOGO_MAX_BYTES ||
    !format ||
    DECLARED[file.type] !== format
  ) {
    return fail(IdentityErrors.logoInvalid());
  }
  let png: Uint8Array;
  try {
    png = await deps.logoProcessor.toPng(file.bytes, LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT);
  } catch {
    return fail(IdentityErrors.logoInvalid());
  }
  const key = `org/${ctx.organizationId}/identity/logo-${newId()}.png`;
  await deps.logos.put(key, png, "image/png");

  let previousKey: string | null = null;
  const result = await withTransaction(ctx, async (uow) => {
    const org = await uow.tx.organization.findFirst({});
    if (!org) return fail(CommonErrors.notFound());
    previousKey = org.logoObjectKey;
    await uow.tx.organization.updateMany({
      where: {},
      data: { logoObjectKey: key, logoVersion: { increment: 1 }, updatedById: ctx.user.id },
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "organization",
      entityId: ctx.organizationId,
      summary: "Logotipo alterado",
      changes: { logo: { before: org.logoObjectKey ? "definido" : null, after: "definido" } },
    });
    return ok({ logoUrl: `/api/organization/logo?v=${org.logoVersion + 1}` });
  });
  if (!result.ok) {
    await deps.logos.delete(key).catch(() => undefined);
    return result;
  }
  if (previousKey) await deps.logos.delete(previousKey).catch(() => undefined);
  return result;
}

export async function removeOrganizationLogo(
  deps: IdentityDeps,
  ctx: RequestContext,
): Promise<Result<{ logoUrl: null }>> {
  const allowed = await authorize(ctx, "organization:update");
  if (!allowed.ok) return allowed;
  let previousKey: string | null = null;
  const result = await withTransaction(ctx, async (uow) => {
    const org = await uow.tx.organization.findFirst({});
    if (!org) return fail(CommonErrors.notFound());
    previousKey = org.logoObjectKey;
    if (!previousKey) return ok({ logoUrl: null });
    await uow.tx.organization.updateMany({
      where: {},
      data: { logoObjectKey: null, logoVersion: { increment: 1 }, updatedById: ctx.user.id },
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "organization",
      entityId: ctx.organizationId,
      summary: "Logotipo removido",
      changes: { logo: { before: "definido", after: null } },
    });
    return ok({ logoUrl: null });
  });
  if (result.ok && previousKey) await deps.logos.delete(previousKey).catch(() => undefined);
  return result;
}

export async function getOrganizationLogo(
  deps: IdentityDeps,
  ctx: RequestContext,
): Promise<Result<{ body: Uint8Array; etag: string } | null>> {
  const allowed = await authorize(ctx, "organization:read");
  if (!allowed.ok) return allowed;
  const profile = await withTransaction(ctx, async (uow) => {
    const org = await uow.tx.organization.findFirst({ select: { logoObjectKey: true, logoVersion: true } });
    return ok(org);
  });
  if (!profile.ok || !profile.value?.logoObjectKey) return ok(null);
  const object = await deps.logos.get(profile.value.logoObjectKey);
  if (!object) return ok(null);
  return ok({ body: object.body, etag: `"logo-${ctx.organizationId}-${profile.value.logoVersion}"` });
}

// setup:admin (spec section 3): creates the organization and the first administrator invitation.
// Refuses to run when an organization already exists.
const setupSchema = z.object({
  organizationName: z.string().trim().min(2).max(150),
  legalName: z.string().trim().min(2).max(150).optional(),
  cnpj: z.string().trim().optional(),
  adminName: z.string().trim().min(2).max(150),
  adminEmail: emailSchema,
});

export async function setupFirstAdministrator(
  deps: IdentityDeps,
  input: unknown,
  countOrganizations: () => Promise<number>,
): Promise<Result<{ organizationId: string; invitationUrl: string; expiresAt: Date }>> {
  const parsed = parseInput(setupSchema, input);
  if (!parsed.ok) return parsed;
  const { organizationName, legalName, adminName, adminEmail } = parsed.value;
  const cnpj = parsed.value.cnpj ? normalizeCnpj(parsed.value.cnpj) : null;
  if (cnpj && !isValidCnpj(cnpj)) return fail(IdentityErrors.invalidCnpj());
  if ((await countOrganizations()) > 0) {
    return fail({ code: "SETUP_ALREADY_DONE", httpStatus: 409 });
  }

  const organizationId = newId();
  const ctx: SystemContext = {
    kind: "system",
    requestId: newId(),
    organizationId,
    ipAddress: null,
    userAgent: "setup-admin",
  };
  const created = await withTransaction(ctx, async (uow) => {
    await uow.tx.organization.create({
      data: {
        id: organizationId,
        legalName: legalName ?? organizationName,
        tradeName: organizationName,
        cnpj,
      },
    });
    await uow.audit.record({
      action: "CREATE",
      entityType: "organization",
      entityId: organizationId,
      summary: "Organização criada pelo setup:admin",
    });
    return ok(undefined);
  });
  if (!created.ok) return created;

  const invitation = await createInvitation(deps, ctx, {
    name: adminName,
    email: adminEmail,
    role: "ADMINISTRATOR",
  });
  if (!invitation.ok) return invitation;
  return ok({ organizationId, invitationUrl: invitation.value.url, expiresAt: invitation.value.expiresAt });
}
