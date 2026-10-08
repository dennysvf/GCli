import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eventBus, withTransaction } from "@/shared/db/transaction";
import { db } from "@/shared/db/client";
import { EventRejection } from "@/shared/events/event-bus";
import { domainError } from "@/shared/kernel/errors";
import { ok } from "@/shared/kernel/result";
import { closeHelpers, createOrganization, createUser, resetDatabase, signedInContext } from "../helpers";

beforeEach(resetDatabase);
afterAll(closeHelpers);

describe("event handler rejection", () => {
  it("F09: a handler rejection rolls the operation back and returns its domain error", async () => {
    const organizationId = await createOrganization();
    const user = await createUser({ organizationId, role: "ADMINISTRATOR" });
    const { ctx } = await signedInContext(user);
    const error = domainError("BILLING_CHECK_IN_UNDO_HAS_PAYMENTS", 409);
    eventBus.subscribe("Test.Rejected", async () => {
      throw new EventRejection(error);
    });

    const result = await withTransaction(ctx, async (uow) => {
      await uow.tx.user.update({ where: { id: user.id }, data: { name: "Changed" } });
      await uow.publish({ type: "Test.Rejected", occurredAt: new Date(), payload: {} });
      return ok(undefined);
    });

    expect(result).toEqual({ ok: false, error });
    expect((await db().user.findUniqueOrThrow({ where: { id: user.id } })).name).not.toBe("Changed");
  });
});
