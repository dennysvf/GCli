import { describe, expect, it } from "vitest";
import { domainError } from "@/shared/kernel/errors";
import { EventBus, EventRejection } from "./event-bus";

describe("EventBus", () => {
  it("F09: a rejection thrown by a handler reaches the publisher with its domain error", async () => {
    const bus = new EventBus<null>();
    const error = domainError("BILLING_CHECK_IN_UNDO_HAS_PAYMENTS", 409);
    bus.subscribe("X", async () => {
      throw new EventRejection(error);
    });
    await expect(bus.publish({ type: "X", occurredAt: new Date(), payload: {} }, null)).rejects.toMatchObject(
      {
        error,
      },
    );
  });

  it("runs the handlers of an event in subscription order", async () => {
    const bus = new EventBus<null>();
    const seen: number[] = [];
    bus.subscribe("X", async () => void seen.push(1));
    bus.subscribe("X", async () => void seen.push(2));
    await bus.publish({ type: "X", occurredAt: new Date(), payload: {} }, null);
    expect(seen).toEqual([1, 2]);
  });
});
