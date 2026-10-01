import { Prisma } from "@/generated/prisma/client";
import { db, type Db } from "./client";

// Tenant isolation (architecture 5.1, ADR-003): every query on a tenant model is filtered by
// organizationId and every create receives it. Register new tenant models here.
const TENANT_MODELS = new Set<string>([
  "User",
  "Invitation",
  // F02
  "Unit",
  "UnitBusinessHours",
  "UnitClosure",
  "Room",
  "UnitSelection",
  // F03
  "ServiceCategory",
  "Service",
  "ServiceAllowedRoom",
  "ServicePriceChange",
  // F04
  "Professional",
  "ProfessionalService",
  "ProfessionalSchedule",
  "ProfessionalWorkingInterval",
  "ProfessionalTimeOff",
  // F05
  "Patient",
  "ReferralSource",
  "Tag",
  "PatientTag",
  "PrivacyTermsVersion",
  "ConsentRecord",
  "ConsentUpload",
]);
// The organization row itself is scoped by its id.
const ORGANIZATION_MODEL = "Organization";

const READ_WRITE_WITH_WHERE = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "upsert",
]);

type Args = Record<string, unknown>;

function scopeWhere(args: Args, filter: Record<string, string>): Args {
  const where = (args.where as Args | undefined) ?? {};
  return { ...args, where: { ...where, ...filter } };
}

function scopeData(data: unknown, organizationId: string): unknown {
  if (Array.isArray(data)) return data.map((row: Args) => ({ ...row, organizationId }));
  return { ...(data as Args), organizationId };
}

export function scopeArgs(model: string, operation: string, args: Args, organizationId: string): Args {
  if (model === ORGANIZATION_MODEL) {
    return READ_WRITE_WITH_WHERE.has(operation) ? scopeWhere(args, { id: organizationId }) : args;
  }
  if (!TENANT_MODELS.has(model)) return args;

  let scoped = args;
  if (READ_WRITE_WITH_WHERE.has(operation)) scoped = scopeWhere(scoped, { organizationId });
  if (operation === "create" || operation === "createMany" || operation === "createManyAndReturn") {
    scoped = { ...scoped, data: scopeData(scoped.data, organizationId) };
  }
  if (operation === "upsert") scoped = { ...scoped, create: scopeData(scoped.create, organizationId) };
  return scoped;
}

export function forTenant(organizationId: string, client: Db = db()) {
  return client.$extends(
    Prisma.defineExtension({
      name: "tenant-scope",
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            return query(scopeArgs(model, operation, (args ?? {}) as Args, organizationId) as typeof args);
          },
        },
      },
    }),
  );
}

export type TenantClient = ReturnType<typeof forTenant>;
export type TenantTx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];
