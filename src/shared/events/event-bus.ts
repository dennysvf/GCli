import type { DomainError } from "@/shared/kernel/errors";

// In-process domain events (architecture 5.4, ADR-007). Handlers run synchronously inside the
// publisher's transaction, so a failing handler rolls back the whole operation.
export type DomainEvent = { type: string; occurredAt: Date; payload: Record<string, unknown> };

export type EventHandler<U> = (event: DomainEvent, unitOfWork: U) => Promise<void>;

export class EventBus<U> {
  private readonly handlers = new Map<string, EventHandler<U>[]>();

  subscribe(type: string, handler: EventHandler<U>): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  async publish(event: DomainEvent, unitOfWork: U): Promise<void> {
    for (const handler of this.handlers.get(event.type) ?? []) {
      await handler(event, unitOfWork);
    }
  }
}

// A handler throws this to refuse the operation that published the event, for an expected business
// reason (ADR-034, for example a paid charge blocks undoing a check-in). withTransaction rolls
// back and returns the error as a failed Result. Anything else a handler throws stays a 500.
export class EventRejection extends Error {
  constructor(readonly error: DomainError) {
    super(error.code);
    this.name = "EventRejection";
  }
}
