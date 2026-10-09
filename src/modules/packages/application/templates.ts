import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { PackageErrors } from "../domain/errors";
import type { PackagesDeps } from "./ports";
import { listTemplatesSchema, saveTemplateSchema, setNoShowSchema, setTemplateActiveSchema } from "./schemas";

export type TemplateItem = {
  id: string;
  name: string;
  serviceId: string;
  serviceName: string;
  // The regular price of the service per currency, for the per-session comparison (PRD F10).
  servicePrices: { currency: string; amountMinor: number }[];
  sessions: number;
  validityDays: number;
  prices: { currency: string; amountMinor: number }[];
  active: boolean;
  version: number;
};

export async function listTemplates(
  deps: PackagesDeps,
  ctx: RequestContext,
  input?: unknown,
): Promise<Result<TemplateItem[]>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(listTemplatesSchema, input ?? {});
  if (!parsed.ok) return parsed;
  const rows = await withTransaction(ctx, async (uow) =>
    ok(
      await uow.tx.packageTemplate.findMany({
        where: parsed.value.includeInactive ? {} : { active: true },
        include: { prices: true },
        orderBy: { name: "asc" },
      }),
    ),
  );
  if (!rows.ok) return rows;
  const services = await deps.directory.services(ctx, [...new Set(rows.value.map((row) => row.serviceId))]);
  const byId = new Map(services.map((service) => [service.id, service]));
  return ok(
    rows.value.map((row) => ({
      id: row.id,
      name: row.name,
      serviceId: row.serviceId,
      serviceName: byId.get(row.serviceId)?.name ?? "",
      servicePrices: byId.get(row.serviceId)?.prices ?? [],
      sessions: row.sessions,
      validityDays: row.validityDays,
      prices: row.prices
        .map((price) => ({ currency: price.currency, amountMinor: Number(price.amountMinor) }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
      active: row.active,
      version: row.version,
    })),
  );
}

// PRD F10: one service per template, 2–100 sessions, a price per currency of the active units and
// 30–730 days of validity. Names are unique ignoring case.
export async function saveTemplate(
  deps: PackagesDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ templateId: string; version: number }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(saveTemplateSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;

  const [service, units] = await Promise.all([
    deps.directory.service(ctx, data.serviceId),
    deps.directory.activeUnits(ctx),
  ]);
  if (!service || !service.active) return fail(PackageErrors.serviceInvalid());
  const currencies = new Set(units.map((unit) => unit.currency as string));
  const prices = [...new Map(data.prices.map((price) => [price.currency, price])).values()];
  if (prices.some((price) => !currencies.has(price.currency))) {
    return fail(PackageErrors.templateInvalid({ prices: "packages.validation.priceCurrency" }));
  }

  return withTransaction(ctx, async (uow) => {
    const clash = await uow.tx.packageTemplate.findFirst({
      where: {
        name: { equals: data.name, mode: "insensitive" },
        ...(data.templateId ? { id: { not: data.templateId } } : {}),
      },
      select: { id: true },
    });
    if (clash) return fail(PackageErrors.templateNameTaken());

    let templateId = data.templateId ?? newId();
    let version = 1;
    if (data.templateId) {
      const current = await uow.tx.packageTemplate.findFirst({ where: { id: data.templateId } });
      if (!current) return fail(PackageErrors.templateNotFound());
      if (data.version !== undefined && current.version !== data.version) return fail(PackageErrors.stale());
      templateId = current.id;
      version = current.version + 1;
      await uow.tx.packageTemplate.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          name: data.name,
          serviceId: data.serviceId,
          sessions: data.sessions,
          validityDays: data.validityDays,
          active: data.active,
          version,
        },
      });
      await uow.tx.packageTemplatePrice.deleteMany({ where: { templateId } });
    } else {
      await uow.tx.packageTemplate.create({
        data: {
          id: templateId,
          organizationId: ctx.organizationId,
          name: data.name,
          serviceId: data.serviceId,
          sessions: data.sessions,
          validityDays: data.validityDays,
          active: data.active,
        },
      });
    }
    await uow.tx.packageTemplatePrice.createMany({
      data: prices.map((price) => ({
        organizationId: ctx.organizationId,
        templateId,
        currency: price.currency,
        amountMinor: BigInt(price.amountMinor),
      })),
    });
    await uow.audit.record({
      action: data.templateId ? "UPDATE" : "CREATE",
      entityType: "package_template",
      entityId: templateId,
      summary: data.templateId ? "Modelo de pacote alterado" : "Modelo de pacote criado",
      metadata: {
        sessions: data.sessions,
        validityDays: data.validityDays,
        currencies: prices.map((p) => p.currency),
      },
    });
    return ok({ templateId, version });
  });
}

export async function setTemplateActive(
  _deps: PackagesDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ version: number }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setTemplateActiveSchema, input);
  if (!parsed.ok) return parsed;
  const { templateId, version, active } = parsed.value;
  return withTransaction(ctx, async (uow) => {
    const updated = await uow.tx.packageTemplate.updateMany({
      where: { id: templateId, version },
      data: { active, version: { increment: 1 } },
    });
    if (updated.count !== 1) return fail(PackageErrors.stale());
    await uow.audit.record({
      action: "UPDATE",
      entityType: "package_template",
      entityId: templateId,
      summary: active ? "Modelo de pacote ativado" : "Modelo de pacote desativado",
    });
    return ok({ version: version + 1 });
  });
}

// PRD F10: whether a no-show debits a session (default: it does not).
export async function getNoShowDebit(ctx: RequestContext): Promise<Result<boolean>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const settings = await uow.tx.packageSettings.findFirst({ select: { debitNoShow: true } });
    return ok(settings?.debitNoShow ?? false);
  });
}

export async function setNoShowDebit(
  _deps: PackagesDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ enabled: boolean }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setNoShowSchema, input);
  if (!parsed.ok) return parsed;
  const { enabled } = parsed.value;
  return withTransaction(ctx, async (uow) => {
    const before = await uow.tx.packageSettings.findFirst({ select: { debitNoShow: true } });
    await uow.tx.packageSettings.upsert({
      where: { organizationId: ctx.organizationId },
      create: { organizationId: ctx.organizationId, debitNoShow: enabled, updatedById: ctx.user.id },
      update: { debitNoShow: enabled, updatedById: ctx.user.id },
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "package_settings",
      summary: "Débito de falta em pacotes alterado",
      changes: { debitNoShow: { before: before?.debitNoShow ?? false, after: enabled } },
    });
    return ok({ enabled });
  });
}
