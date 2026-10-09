import { authorize } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { PackageErrors } from "../domain/errors";
import type { PackagesDeps } from "./ports";
import { coverageSchema, eligibleSchema, patientPackagesSchema } from "./schemas";
import { packageView, type PackageCard, type PackageLinkView } from "./views";
import { toPackageProps } from "./rows";
import { listTemplates, type TemplateItem } from "./templates";

export type EligiblePackage = {
  id: string;
  name: string;
  freeSessions: number;
  totalSessions: number;
  expiresOn: string;
};

// PRD F10: the packages of the patient that the booking panel may offer for a service on a date:
// active, valid on that date and with a free balance.
export async function eligiblePackages(
  deps: PackagesDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<EligiblePackage[]>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(eligibleSchema, input);
  if (!parsed.ok) return parsed;
  const { patientId, serviceId, date } = parsed.value;
  const patient = await deps.directory.patient(ctx, patientId);
  if (!patient.ok) return patient;
  return withTransaction(ctx, async (uow) => {
    const rows = await uow.tx.patientPackage.findMany({
      where: { patientId, serviceId, status: "ACTIVE", expiresOn: { gte: new Date(`${date}T00:00:00Z`) } },
      orderBy: [{ expiresOn: "asc" }, { soldOn: "asc" }],
    });
    const open = await uow.tx.packageAppointment.groupBy({
      by: ["packageId"],
      where: { packageId: { in: rows.map((row) => row.id) }, status: "LINKED" },
      _count: { _all: true },
    });
    const openOf = new Map(open.map((item) => [item.packageId, item._count._all]));
    return ok(
      rows
        .map((row) => ({
          id: row.id,
          name: row.name,
          totalSessions: row.totalSessions,
          expiresOn: row.expiresOn.toISOString().slice(0, 10),
          freeSessions:
            row.totalSessions - row.usedSessions - row.forfeitedSessions - (openOf.get(row.id) ?? 0),
        }))
        .filter((item) => item.freeSessions >= 1),
    );
  });
}

// How many of `count` occurrences of a series the package covers (PRD F10, interview).
export async function seriesCoverage(
  deps: PackagesDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ covered: number; rest: number }>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(coverageSchema, input);
  if (!parsed.ok) return parsed;
  const { packageId, count } = parsed.value;
  return withTransaction(ctx, async (uow) => {
    const pkg = await deps.packages.findById(uow, packageId, { lock: false });
    if (!pkg) return fail(PackageErrors.notFound());
    const covered = Math.min(count, Math.max(0, pkg.freeSessions));
    return ok({ covered, rest: count - covered });
  });
}

export type PatientPackages = { packages: PackageCard[]; hasOpenBalance: boolean };

// The "Pacotes" section of the patient's Financeiro tab (PRD F10 Experience).
export async function listPatientPackages(
  deps: PackagesDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<PatientPackages>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(patientPackagesSchema, input);
  if (!parsed.ok) return parsed;
  const { patientId } = parsed.value;
  const patient = await deps.directory.patient(ctx, patientId);
  if (!patient.ok) return patient;

  const loaded = await withTransaction(ctx, async (uow) => {
    const rows = await uow.tx.patientPackage.findMany({
      where: { patientId },
      orderBy: [{ soldOn: "desc" }, { id: "desc" }],
    });
    const links = await uow.tx.packageAppointment.findMany({
      where: { packageId: { in: rows.map((row) => row.id) } },
      orderBy: { linkedAt: "asc" },
    });
    return ok({ rows, links });
  });
  if (!loaded.ok) return loaded;
  const { rows, links } = loaded.value;

  const [services, statuses, appointments] = await Promise.all([
    deps.directory.services(ctx, [...new Set(rows.map((row) => row.serviceId))]),
    deps.billing.chargeStatuses(
      ctx,
      rows.map((row) => row.chargeId),
    ),
    deps.directory.appointments(
      ctx,
      links.map((link) => link.appointmentId),
    ),
  ]);
  const serviceName = new Map(services.map((service) => [service.id, service.name]));

  const cards: PackageCard[] = rows.map((row) => {
    const mine = links.filter((link) => link.packageId === row.id);
    const open = mine.filter((link) => link.status === "LINKED").length;
    const props = toPackageProps(row, open);
    const live = mine
      .filter((link) => link.status === "LINKED" || link.status === "DEBITED")
      .sort((a, b) => {
        const left = appointments.get(a.appointmentId)?.startsAt ?? "";
        const right = appointments.get(b.appointmentId)?.startsAt ?? "";
        return left.localeCompare(right);
      });
    const linkViews: PackageLinkView[] = mine
      .filter((link) => link.status === "LINKED" || link.status === "DEBITED" || link.flagged)
      .map((link) => {
        const info = appointments.get(link.appointmentId);
        const index = live.findIndex((item) => item.id === link.id);
        return {
          id: link.id,
          appointmentId: link.appointmentId,
          status: link.status,
          flagged: link.flagged,
          startsAt: info?.startsAt ?? null,
          professionalName: info?.professionalName ?? null,
          appointmentStatus: info?.status ?? null,
          unitTimeZone: info?.unitTimeZone ?? null,
          session: index >= 0 ? index + 1 : null,
        };
      })
      .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
    return {
      ...packageView(props, {
        serviceName: serviceName.get(row.serviceId) ?? "",
        chargeStatus: statuses.get(row.chargeId) ?? null,
      }),
      links: linkViews,
    };
  });

  const hasOpenBalance = cards.some(
    (card) =>
      card.status === "ACTIVE" &&
      card.chargeStatus !== null &&
      card.chargeStatus !== "PAID" &&
      card.chargeStatus !== "CANCELLED",
  );
  return ok({ packages: cards, hasOpenBalance });
}

export type SellOptions = {
  templates: TemplateItem[];
  units: { id: string; name: string; currency: string }[];
  selectedUnitId: string | null;
  approvers: { id: string; name: string }[];
  canApprove: boolean;
};

// What the "Vender pacote" dialog offers: active templates, active units, the selected unit and the
// managers who can approve a discount by PIN.
export async function getSellOptions(deps: PackagesDeps, ctx: RequestContext): Promise<Result<SellOptions>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const [templates, units, selectedUnitId, approvers] = await Promise.all([
    listTemplates(deps, ctx),
    deps.directory.activeUnits(ctx),
    deps.directory.selectedUnitId(ctx),
    deps.directory.approvers(ctx),
  ]);
  if (!templates.ok) return templates;
  return ok({
    templates: templates.value,
    units: units.map((unit) => ({ id: unit.id, name: unit.name, currency: unit.currency })),
    selectedUnitId,
    approvers,
    canApprove: can(ctx, "billing:approve"),
  });
}
