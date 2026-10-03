import { registerProfessionalsPorts } from "@/modules/professionals";
import { registerSchedulingPorts } from "@/modules/scheduling";
import { subscribeServicesEvents } from "@/modules/services";
import { eventBus } from "@/shared/db/transaction";

// Composition root: cross-module wiring that must exist once per process (ADR-007). Called by
// the web server (instrumentation), the worker, CLI scripts and the integration tests. Later
// features register their port implementations here too (F04, F06).
const globalForComposition = globalThis as unknown as { gcliModulesRegistered?: boolean };

export function registerModules(): void {
  if (globalForComposition.gcliModulesRegistered) return;
  globalForComposition.gcliModulesRegistered = true;
  subscribeServicesEvents(eventBus);
  // F04: linked professionals for identity (F01) and professional counts for services (F03).
  registerProfessionalsPorts();
  // F06: real appointments for units (F02), services (F03), professionals (F04) and patients (F05).
  registerSchedulingPorts();
}
