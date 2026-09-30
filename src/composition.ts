import { eventBus } from "@/shared/db/transaction";

// Composition root: cross-module wiring that must exist once per process (ADR-007). Called by
// the web server (instrumentation), the worker, CLI scripts and the integration tests. Later
// features register their port implementations here too (F04, F06).
const globalForComposition = globalThis as unknown as { gcliModulesRegistered?: boolean };

export function registerModules(): void {
  if (globalForComposition.gcliModulesRegistered) return;
  globalForComposition.gcliModulesRegistered = true;
  void eventBus;
}
