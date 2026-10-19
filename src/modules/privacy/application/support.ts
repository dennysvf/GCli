import type { SystemContext } from "@/shared/context/types";
import { newId } from "@/shared/kernel/ids";

// The context of the worker's privacy jobs: no signed-in user, so their audit events are SYSTEM.
export function systemContext(organizationId: string): SystemContext {
  return { kind: "system", requestId: newId(), organizationId, ipAddress: null, userAgent: null };
}

// A unique violation, as Prisma reports it (code P2002, or the index name in the message). The
// callers only insert rows whose sole unique index besides the primary key is the named one.
export function isUniqueViolation(error: unknown, indexName: string): boolean {
  const candidate = error as { code?: string; message?: string; meta?: unknown };
  const text = `${candidate.message ?? ""} ${JSON.stringify(candidate.meta ?? {})}`;
  return candidate.code === "P2002" || text.includes(indexName);
}

// The short id of a request, shown in file names and in the PDF: never a part of the patient's name.
export function shortRequestId(requestId: string): string {
  return requestId.replace(/-/g, "").slice(-6);
}
