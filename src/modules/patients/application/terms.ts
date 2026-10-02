import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { CommonErrors } from "@/shared/kernel/errors";
import type { PatientsDeps } from "./ports";
import { publishTermsSchema } from "./schemas";

// The clinic's privacy terms (PRD F05): maintained by the Administrator with versioning. Versions
// are append-only (legal evidence); a new version leaves earlier consents pending.
export type TermsVersion = {
  id: string;
  version: number;
  text: string;
  publishedAt: string;
  publishedByName: string | null;
};

export async function listTermsVersions(
  deps: PatientsDeps,
  ctx: RequestContext,
): Promise<Result<TermsVersion[]>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const rows = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.privacyTermsVersion.findMany({ orderBy: { version: "desc" } })),
  );
  if (!rows.ok) return rows;
  const names = await deps.userNames(
    ctx,
    rows.value.flatMap((row) => (row.publishedById ? [row.publishedById] : [])),
  );
  return ok(
    rows.value.map((row) => ({
      id: row.id,
      version: row.version,
      text: row.text,
      publishedAt: row.publishedAt.toISOString(),
      publishedByName: row.publishedById ? (names.get(row.publishedById) ?? null) : null,
    })),
  );
}

// The version a new consent refers to, shown in the consent dialog.
export async function getCurrentTerms(
  ctx: RequestContext,
): Promise<Result<Omit<TermsVersion, "publishedByName"> | null>> {
  const allowed = await authorize(ctx, "patient:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const row = await uow.tx.privacyTermsVersion.findFirst({ orderBy: { version: "desc" } });
    return ok(
      row
        ? { id: row.id, version: row.version, text: row.text, publishedAt: row.publishedAt.toISOString() }
        : null,
    );
  });
}

export async function publishTermsVersion(
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ version: number }>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(publishTermsSchema, input);
  if (!parsed.ok) return parsed;
  try {
    return await withTransaction(ctx, async (uow) => {
      const last = await uow.tx.privacyTermsVersion.findFirst({
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;
      const id = newId();
      await uow.tx.privacyTermsVersion.create({
        data: {
          id,
          organizationId: ctx.organizationId,
          version,
          text: parsed.value.text,
          publishedById: ctx.user.id,
        },
      });
      await uow.audit.record({
        action: "CREATE",
        entityType: "privacy_terms_version",
        entityId: id,
        summary: `Termos de privacidade versão ${version} publicados`,
        changes: { version: { before: last?.version ?? null, after: version } },
      });
      return ok({ version });
    });
  } catch (error) {
    // Two administrators publishing at once: the unique (organization, version) index decides.
    if ((error as { code?: string }).code === "P2002") return fail(CommonErrors.staleVersion());
    throw error;
  }
}
