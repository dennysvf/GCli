import { withTransaction } from "@/shared/db/transaction";
import { ok } from "@/shared/kernel/result";
import type { SystemContext } from "@/shared/context/types";
import { newId } from "@/shared/kernel/ids";

// Active services without a price in a currency, for the warning units show when a unit brings a
// currency the catalog does not price yet (PRD F16).
export async function servicesWithoutPrice(
  organizationId: string,
  currency: string,
): Promise<{ id: string; name: string }[]> {
  const ctx: SystemContext = {
    kind: "system",
    requestId: newId(),
    organizationId,
    ipAddress: null,
    userAgent: null,
  };
  const result = await withTransaction(ctx, async (uow) =>
    ok(
      await uow.tx.service.findMany({
        where: { active: true, prices: { none: { currency } } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ),
  );
  return result.ok ? result.value : [];
}
