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
