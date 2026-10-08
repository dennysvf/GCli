import { authorize } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { addDays, daysBetween } from "@/shared/kernel/calendar-date";
import { countryProfile } from "@/shared/kernel/countries";
import type { CountryCode } from "@/shared/kernel/countries/codes";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { zonedTimeToUtc } from "@/shared/kernel/zoned-time";
import { BillingErrors } from "../domain/errors";
import { MAX_PERIOD_DAYS, PAGE_SIZE } from "../domain/limits";
import { enabledMethods } from "./payment-methods";
import { earliestPaymentDate } from "./payments";
import type { BillingDeps, ChargeTotals } from "./ports";
import { chargeIdSchema, listChargesSchema } from "./schemas";
import {
  chargeView,
  loadNames,
  requestView,
  viewOf,
  type ChargeView,
  type DiscountRequestView,
} from "./views";

const OPEN_STATUSES = ["PENDING_APPROVAL", "OPEN", "PARTIALLY_PAID"] as const;

// The charge of an appointment for the agenda panel: the live one, if any.
export async function getAppointmentCharge(
  deps: BillingDeps,
  ctx: RequestContext,
  appointmentId: string,
): Promise<Result<ChargeView | null>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const found = await withTransaction(ctx, async (uow) =>
    ok(await deps.charges.findLiveByAppointment(uow, ctx.organizationId, appointmentId, { lock: false })),
  );
  if (!found.ok) return found;
  return ok(found.value ? await viewOf(deps.directory, ctx, found.value) : null);
}

export type ChargeDetail = { charge: ChargeView; requests: DiscountRequestView[] };

export async function getCharge(
  deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ChargeDetail>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(chargeIdSchema, input);
  if (!parsed.ok) return parsed;
  const loaded = await withTransaction(ctx, async (uow) => {
    const charge = await deps.charges.findById(uow, ctx.organizationId, parsed.value.chargeId, {
      lock: false,
    });
    if (!charge) return fail(BillingErrors.chargeNotFound());
    return ok({ charge, requests: await deps.reads.requestHistory(uow, charge.id) });
  });
  if (!loaded.ok) return loaded;
  const { charge, requests } = loaded.value;
  const names = await loadNames(deps.directory, ctx, [
    charge.snapshot,
    ...requests.map((request) => ({ ...charge.snapshot, pendingRequest: request })),
  ]);
  return ok({
    charge: chargeView(charge, names),
    requests: requests.map((request) => requestView(request, names)),
  });
}

export type ChargeList = { items: ChargeView[]; nextCursor: string | null; totals: ChargeTotals[] };

function parseCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = cursor.split("|");
  const createdAt = iso ? new Date(iso) : null;
  return createdAt && !Number.isNaN(createdAt.getTime()) && id ? { createdAt, id } : null;
}

// Filters (PRD F09): period (in the unit's time zone), unit, status, professional and payment
// method. The totals cover the whole filtered set, one line per currency.
export async function listCharges(
  deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ChargeList>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(listChargesSchema, input ?? {});
  if (!parsed.ok) return parsed;
  const filter = parsed.value;

  const [filterUnit, organization] = await Promise.all([
    filter.unitId
      ? deps.directory.unit(ctx, filter.unitId)
      : deps.directory
          .selectedUnitId(ctx)
          .then((selected) => (selected ? deps.directory.unit(ctx, selected) : null)),
    deps.directory.organization(ctx),
  ]);
  const timeZone = filterUnit?.timeZone ?? organization.timeZone;
  const today = dateInTimeZone(deps.clock(), timeZone);
  const from = filter.from ?? filter.to ?? today;
  const to = filter.to ?? filter.from ?? today;
  if (to < from || daysBetween(from, to) > MAX_PERIOD_DAYS) {
    return fail(CommonErrors.validationFailed({ to: "billing.validation.periodInvalid" }));
  }

  const page = await withTransaction(ctx, async (uow) =>
    ok(
      await deps.reads.list(
        uow,
        {
          from: zonedTimeToUtc(`${from}T00:00`, timeZone),
          to: zonedTimeToUtc(`${addDays(to, 1)}T00:00`, timeZone),
          ...(filter.unitId ? { unitId: filter.unitId } : {}),
          ...(filter.statuses ? { statuses: filter.statuses } : {}),
          ...(filter.professionalId ? { professionalId: filter.professionalId } : {}),
          ...(filter.method ? { method: filter.method } : {}),
          ...(filter.patientId ? { patientId: filter.patientId } : {}),
        },
        { cursor: parseCursor(filter.cursor), take: PAGE_SIZE },
      ),
    ),
  );
  if (!page.ok) return page;
  const names = await loadNames(deps.directory, ctx, page.value.items);
  const items = page.value.items.map((props) => chargeView(props, names));
  const last = items.at(-1);
  return ok({
    items,
    nextCursor: page.value.hasMore && last ? `${last.createdAt}|${last.id}` : null,
    totals: page.value.totals,
  });
}

export type PatientCharges = {
  open: ChargeView[];
  dueByCurrency: { currency: string; balanceMinor: number }[];
  history: ChargeView[];
};

export async function listPatientCharges(
  deps: BillingDeps,
  ctx: RequestContext,
  patientId: string,
): Promise<Result<PatientCharges>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const patient = await deps.directory.patient(ctx, patientId);
  if (!patient.ok) return patient;
  const page = await withTransaction(ctx, async (uow) =>
    ok(await deps.reads.list(uow, { patientId }, { cursor: null, take: 200 })),
  );
  if (!page.ok) return page;
  const names = await loadNames(deps.directory, ctx, page.value.items);
  const all = page.value.items.map((props) => chargeView(props, names));
  const open = all.filter((charge) => (OPEN_STATUSES as readonly string[]).includes(charge.status));
  const due = new Map<string, number>();
  for (const charge of open) due.set(charge.currency, (due.get(charge.currency) ?? 0) + charge.balanceMinor);
  return ok({
    open,
    dueByCurrency: [...due].map(([currency, balanceMinor]) => ({ currency, balanceMinor })),
    history: all,
  });
}

export type ReceiveOptions = {
  charge: ChargeView;
  selectedUnitId: string | null;
  units: {
    id: string;
    name: string;
    country: CountryCode;
    currency: string;
    timeZone: string;
    minReceivedAt: string;
  }[];
  methodsByCountry: Record<string, string[]>;
  approvers: { id: string; name: string }[];
  canApprove: boolean;
};

// Everything the receive modal needs in one read.
export async function getReceiveOptions(
  deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ReceiveOptions>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(chargeIdSchema, input);
  if (!parsed.ok) return parsed;
  const loaded = await withTransaction(ctx, async (uow) => {
    const charge = await deps.charges.findById(uow, ctx.organizationId, parsed.value.chargeId, {
      lock: false,
    });
    if (!charge) return fail(BillingErrors.chargeNotFound());
    return ok(charge);
  });
  if (!loaded.ok) return loaded;
  const [view, units, selectedUnitId, approvers] = await Promise.all([
    viewOf(deps.directory, ctx, loaded.value),
    deps.directory.activeUnits(ctx),
    deps.directory.selectedUnitId(ctx),
    deps.directory.approvers(ctx),
  ]);
  const countries = [...new Set(units.map((unit) => unit.country))];
  const methods = await withTransaction(ctx, async (uow) => {
    const byCountry: Record<string, string[]> = {};
    for (const country of countries) {
      byCountry[country] = countryProfile(country).paymentMethods.length
        ? await enabledMethods(uow, country)
        : [];
    }
    return ok(byCountry);
  });
  if (!methods.ok) return methods;
  const now = deps.clock();
  return ok({
    charge: view,
    selectedUnitId,
    units: units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      country: unit.country,
      currency: unit.currency,
      timeZone: unit.timeZone,
      minReceivedAt: earliestPaymentDate(now, unit.timeZone).toISOString(),
    })),
    methodsByCountry: methods.value,
    approvers,
    canApprove: can(ctx, "billing:approve"),
  });
}

// Charge status for packages (F10): payment state of a charge the caller created.
export async function getChargeStatus(
  deps: BillingDeps,
  ctx: RequestContext,
  chargeId: string,
): Promise<Result<{ status: ChargeView["status"]; paidMinor: number; netMinor: number; currency: string }>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const loaded = await withTransaction(ctx, async (uow) => {
    const charge = await deps.charges.findById(uow, ctx.organizationId, chargeId, { lock: false });
    if (!charge) return fail(BillingErrors.chargeNotFound());
    return ok(charge.snapshot);
  });
  if (!loaded.ok) return loaded;
  const s = loaded.value;
  return ok({ status: s.status, paidMinor: s.paidMinor, netMinor: s.netMinor, currency: s.currency });
}

export type NewChargeOptions = {
  units: { id: string; name: string; currency: string }[];
  selectedUnitId: string | null;
  services: { id: string; name: string; prices: { currency: string; amountMinor: number }[] }[];
  professionals: { id: string; name: string }[];
};

// What the "Nova cobrança" dialog offers: active units, services with their prices, professionals.
export async function getNewChargeOptions(
  deps: BillingDeps,
  ctx: RequestContext,
): Promise<Result<NewChargeOptions>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const [units, selectedUnitId, services, professionals] = await Promise.all([
    deps.directory.activeUnits(ctx),
    deps.directory.selectedUnitId(ctx),
    deps.directory.activeServices(ctx),
    deps.directory.activeProfessionals(ctx),
  ]);
  return ok({
    units: units.map((unit) => ({ id: unit.id, name: unit.name, currency: unit.currency })),
    selectedUnitId,
    services: services.map((service) => ({ id: service.id, name: service.name, prices: service.prices })),
    professionals,
  });
}
