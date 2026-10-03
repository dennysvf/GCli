import { authorize, recordDenial } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { formatAddress } from "@/shared/kernel/address";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { ConsentItem } from "./consents";
import { listConsents } from "./consents";
import { displayName } from "../domain/names";
import { PatientsErrors } from "./errors";
import { identityOf, loadDetails, organizationToday, type PatientDetails } from "./patients";
import { canViewPatient, visiblePatientIds } from "./policies";
import type { PatientsDeps } from "./ports";

// Read API provided to scheduling (F06), documents (F08), packages (F10), the dashboard (F12) and
// the patient timeline (F14) (PRD F05 Provides). Every read applies the visibility policy.

export type PatientIdentity = ReturnType<typeof identityOf> & { formattedAddress: string };

export async function getPatientIdentity(
  deps: PatientsDeps,
  ctx: RequestContext,
  patientId: string,
): Promise<Result<PatientIdentity>> {
  if (!(await canViewPatient(deps, ctx, patientId))) {
    await recordDenial(ctx, "patient:read", patientId);
    return fail(CommonErrors.forbidden());
  }
  const today = await organizationToday(deps, ctx);
  return withTransaction(ctx, async (uow) => {
    const row = await uow.tx.patient.findFirst({ where: { id: patientId } });
    if (!row) return fail(PatientsErrors.notFound());
    const identity = identityOf(row, today);
    return ok({ ...identity, formattedAddress: formatAddress(identity.address) });
  });
}

export type PatientRecord = PatientDetails & {
  consents: ConsentItem[];
  createdByName: string | null;
};

export async function getPatientRecord(
  deps: PatientsDeps,
  ctx: RequestContext,
  patientId: string,
): Promise<Result<PatientRecord>> {
  if (!(await canViewPatient(deps, ctx, patientId))) {
    await recordDenial(ctx, "patient:read", patientId);
    return fail(CommonErrors.forbidden());
  }
  const today = await organizationToday(deps, ctx);
  const loaded = await withTransaction(ctx, async (uow) => {
    const details = await loadDetails(uow, patientId, today);
    const author = await uow.tx.patient.findFirst({
      where: { id: patientId },
      select: { createdById: true },
    });
    return details
      ? ok({ details, createdById: author?.createdById ?? null })
      : fail(PatientsErrors.notFound());
  });
  if (!loaded.ok) return loaded;
  const consents = await listConsents(deps, ctx, patientId);
  if (!consents.ok) return consents;
  const { createdById, details } = loaded.value;
  const names = createdById ? await deps.userNames(ctx, [createdById]) : new Map<string, string>();
  return ok({
    ...details,
    consents: consents.value,
    createdByName: createdById ? (names.get(createdById) ?? null) : null,
  });
}

export type PatientSummary = {
  id: string;
  displayName: string;
  mobilePhone: string;
  birthDate: string;
  active: boolean;
};

// Names and phones of many patients at once, for the agenda (F06) and its printed version. Only
// patients visible to the reader are returned; the others are left out.
export async function getPatientSummaries(
  deps: PatientsDeps,
  ctx: RequestContext,
  patientIds: string[],
): Promise<Result<PatientSummary[]>> {
  const allowed = await authorize(ctx, "patient:read");
  if (!allowed.ok) return allowed;
  const unique = [...new Set(patientIds)];
  if (unique.length === 0) return ok([]);
  const visible = await visiblePatientIds(deps, ctx);
  const ids = visible === null ? unique : unique.filter((id) => visible.includes(id));
  if (ids.length === 0) return ok([]);
  return withTransaction(ctx, async (uow) => {
    const rows = await uow.tx.patient.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        fullName: true,
        socialName: true,
        mobilePhone: true,
        birthDate: true,
        active: true,
      },
    });
    return ok(
      rows.map((row) => ({
        id: row.id,
        displayName: displayName(row.fullName, row.socialName),
        mobilePhone: row.mobilePhone,
        birthDate: row.birthDate.toISOString().slice(0, 10),
        active: row.active,
      })),
    );
  });
}
