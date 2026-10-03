import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { formatDocument, maskDocument, type DocumentType } from "@/shared/kernel/documents";
import { formatPhoneNumber } from "@/shared/kernel/phone";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { ageOn } from "../domain/age";
import { displayName } from "../domain/names";
import { classifySearchTerm, type SearchTerm } from "../domain/search-term";
import { PatientsErrors } from "./errors";
import { visiblePatientIds } from "./policies";
import type { PatientsDeps } from "./ports";
import { searchPatientsSchema } from "./schemas";

export type PatientSearchItem = {
  id: string;
  displayName: string;
  age: number;
  // The identity document, masked for Front Desk (PRD F05, F16): "display" is what to show.
  document: { type: DocumentType; display: string } | null;
  mobilePhone: string;
  lastAppointmentAt: string | null;
  active: boolean;
};

export type PatientSearchResult = {
  items: PatientSearchItem[];
  page: number;
  pageSize: number;
  total: number;
};

type Row = {
  id: string;
  full_name: string;
  social_name: string | null;
  birth_date: Date;
  document_type: string | null;
  document_number: string | null;
  mobile_phone: string;
  active: boolean;
  total: bigint;
};

type Filters = {
  organizationId: string;
  status: "active" | "inactive" | "all";
  restrictIds: string[] | null;
  limit: number;
  offset: number;
};

// LIKE wildcards typed by the user are matched literally.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// One query per kind of term, so each uses its own index (spec F05 section 3). Raw SQL is not
// scoped by the tenant extension: every query filters organization_id explicitly.
function runQuery(uow: UnitOfWork, term: Exclude<SearchTerm, { kind: "too-short" }>, filters: Filters) {
  const { organizationId, status, restrictIds, limit, offset } = filters;
  const contains = `%${escapeLike(term.value)}%`;
  const prefix = `${escapeLike(term.value)}%`;
  const restricted = restrictIds !== null;
  const ids = restrictIds ?? [];
  if (term.kind === "name") {
    return uow.tx.$queryRaw<Row[]>`
      SELECT id, full_name, social_name, birth_date, document_type, document_number, mobile_phone, active, count(*) OVER () AS total
      FROM patient
      WHERE organization_id = ${organizationId}::uuid
        AND (${status} = 'all' OR active = (${status} = 'active'))
        AND (NOT ${restricted} OR id = ANY(${ids}::uuid[]))
        AND normalized_name LIKE ${contains}
      ORDER BY (normalized_name LIKE ${prefix}) DESC, normalized_name, id
      LIMIT ${limit} OFFSET ${offset}`;
  }
  if (term.kind === "document-or-phone") {
    return uow.tx.$queryRaw<Row[]>`
      SELECT id, full_name, social_name, birth_date, document_type, document_number, mobile_phone, active, count(*) OVER () AS total
      FROM patient
      WHERE organization_id = ${organizationId}::uuid
        AND (${status} = 'all' OR active = (${status} = 'active'))
        AND (NOT ${restricted} OR id = ANY(${ids}::uuid[]))
        AND (document_number = ${term.value} OR phone_digits LIKE ${contains})
      ORDER BY normalized_name, id
      LIMIT ${limit} OFFSET ${offset}`;
  }
  if (term.kind === "document") {
    return uow.tx.$queryRaw<Row[]>`
      SELECT id, full_name, social_name, birth_date, document_type, document_number, mobile_phone, active, count(*) OVER () AS total
      FROM patient
      WHERE organization_id = ${organizationId}::uuid
        AND (${status} = 'all' OR active = (${status} = 'active'))
        AND (NOT ${restricted} OR id = ANY(${ids}::uuid[]))
        AND document_number = ${term.value}
      ORDER BY normalized_name, id
      LIMIT ${limit} OFFSET ${offset}`;
  }
  return uow.tx.$queryRaw<Row[]>`
    SELECT id, full_name, social_name, birth_date, document_type, document_number, mobile_phone, active, count(*) OVER () AS total
    FROM patient
    WHERE organization_id = ${organizationId}::uuid
      AND (${status} = 'all' OR active = (${status} = 'active'))
      AND (NOT ${restricted} OR id = ANY(${ids}::uuid[]))
      AND phone_digits LIKE ${contains}
    ORDER BY normalized_name, id
    LIMIT ${limit} OFFSET ${offset}`;
}

// PRD F05 search: name, CPF or phone; 20 per page; CPF masked for Front Desk; professionals only
// see patients with an appointment with them.
export async function searchPatients(
  deps: PatientsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<PatientSearchResult>> {
  const allowed = await authorize(ctx, "patient:read");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(searchPatientsSchema, input ?? {});
  if (!parsed.ok) return parsed;
  const { q, page, status, limit } = parsed.value;
  const term = classifySearchTerm(q);
  if (term.kind === "too-short") return fail(PatientsErrors.searchTooShort());

  const restrictIds = await visiblePatientIds(deps, ctx);
  if (restrictIds !== null && restrictIds.length === 0)
    return ok({ items: [], page, pageSize: limit, total: 0 });
  const today = dateInTimeZone(deps.clock(), await deps.organizationTimeZone(ctx));

  const rows = await withTransaction(ctx, async (uow) =>
    ok(
      await runQuery(uow, term, {
        organizationId: ctx.organizationId,
        status,
        restrictIds,
        limit,
        offset: (page - 1) * limit,
      }),
    ),
  );
  if (!rows.ok) return rows;
  const lastDates = await deps.appointments().lastAppointmentDates(
    ctx.organizationId,
    rows.value.map((row) => row.id),
  );
  const masked = ctx.user.role === "FRONT_DESK";
  return ok({
    page,
    pageSize: limit,
    total: Number(rows.value[0]?.total ?? 0),
    items: rows.value.map((row) => ({
      id: row.id,
      displayName: displayName(row.full_name, row.social_name),
      age: ageOn(row.birth_date.toISOString().slice(0, 10), today),
      document:
        row.document_type && row.document_number
          ? {
              type: row.document_type as DocumentType,
              display: masked
                ? maskDocument(row.document_type as DocumentType, row.document_number)
                : formatDocument(row.document_type as DocumentType, row.document_number),
            }
          : null,
      mobilePhone: formatPhoneNumber(row.mobile_phone, ctx.organizationCountry),
      lastAppointmentAt: lastDates.get(row.id) ?? null,
      active: row.active,
    })),
  });
}
