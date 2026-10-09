import { diffChanges } from "@/shared/audit/diff";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { PackageErrors } from "../domain/errors";
import { packageEvent, type PackageEventPayload } from "../domain/events";
import type { PackageProps, SessionPackage } from "../domain/package";
import type { PackagesDeps } from "./ports";

// Loads a package under its row lock, runs a command on it and saves the result, all in one
// transaction. `expectedVersion` is checked only when the caller depends on the state it saw.
export async function mutatePackage<T>(
  deps: PackagesDeps,
  ctx: RequestContext,
  packageId: string,
  options: { expectedVersion?: number | undefined },
  run: (uow: UnitOfWork, pkg: SessionPackage) => Promise<Result<T>>,
): Promise<Result<{ value: T; pkg: SessionPackage }>> {
  return withTransaction(ctx, async (uow) => {
    const pkg = await deps.packages.findById(uow, packageId, { lock: true });
    if (!pkg) return fail(PackageErrors.notFound());
    if (options.expectedVersion !== undefined && pkg.snapshot.version !== options.expectedVersion) {
      return fail(PackageErrors.stale());
    }
    const result = await run(uow, pkg);
    if (!result.ok) return result;
    if ((await deps.packages.save(uow, pkg)) === "STALE") return fail(PackageErrors.stale());
    return ok({ value: result.value, pkg });
  });
}

const AUDITED = [
  "status",
  "usedSessions",
  "forfeitedSessions",
  "extendedDays",
  "expiresOn",
  "closeReason",
] as const;

export function packageChanges(before: Readonly<PackageProps> | null, after: Readonly<PackageProps>) {
  return diffChanges<PackageProps>(before, after, { fields: [...AUDITED] });
}

export function copyProps(pkg: SessionPackage): PackageProps {
  return { ...pkg.snapshot };
}

export function eventPayload(
  pkg: SessionPackage,
  actorUserId: string | null,
  appointmentId: string | null = null,
): PackageEventPayload {
  const s = pkg.snapshot;
  return {
    packageId: s.id,
    patientId: s.patientId,
    chargeId: s.chargeId,
    appointmentId,
    usedSessions: s.usedSessions,
    totalSessions: s.totalSessions,
    actorUserId,
  };
}

export { packageEvent };
