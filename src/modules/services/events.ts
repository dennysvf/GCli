import { IDENTITY_EVENTS } from "@/modules/identity";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { EventBus } from "@/shared/events/event-bus";
import { seedDefaultCategories } from "./application/categories";

// Subscriptions of the services module, registered once by the composition root (src/composition.ts).
export function subscribeServicesEvents(bus: EventBus<UnitOfWork>): void {
  // PRD F03: new organizations start with "Consultas", "Procedimentos" and "Terapias".
  bus.subscribe(IDENTITY_EVENTS.organizationCreated, async (event, uow) => {
    await seedDefaultCategories(uow, String(event.payload.organizationId));
  });
}
