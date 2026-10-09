import { billingCatalog, registerBillingPorts, subscribeBillingEvents } from "@/modules/billing";
import { packagesCatalog, registerPackagesPorts, subscribePackagesEvents } from "@/modules/packages";
import { clinicalRecordsCatalog, registerClinicalRecordsPorts } from "@/modules/clinical-records";
import { documentsCatalog } from "@/modules/documents";
import { identityCatalog } from "@/modules/identity";
import { unitsCatalog } from "@/modules/units";
import { patientsCatalog } from "@/modules/patients";
import { professionalsCatalog, registerProfessionalsPorts } from "@/modules/professionals";
import { registerSchedulingPorts, schedulingCatalog } from "@/modules/scheduling";
import { registerServicesPorts, servicesCatalog, subscribeServicesEvents } from "@/modules/services";
import { eventBus } from "@/shared/db/transaction";
import { registerCatalog } from "@/shared/i18n/catalogs";

// Composition root: cross-module wiring that must exist once per process (ADR-007). Called by
// the web server (instrumentation), the worker, CLI scripts and the integration tests. Later
// features register their port implementations here too (F04, F06).
const globalForComposition = globalThis as unknown as { gcliModulesRegistered?: boolean };

export function registerModules(): void {
  if (globalForComposition.gcliModulesRegistered) return;
  globalForComposition.gcliModulesRegistered = true;
  // Message catalogs (ADR-028): each module owns one per language.
  registerCatalog("identity", identityCatalog);
  registerCatalog("units", unitsCatalog);
  registerCatalog("services", servicesCatalog);
  registerCatalog("professionals", professionalsCatalog);
  registerCatalog("patients", patientsCatalog);
  registerCatalog("scheduling", schedulingCatalog);
  registerCatalog("clinicalRecords", clinicalRecordsCatalog);
  registerCatalog("documents", documentsCatalog);
  registerCatalog("billing", billingCatalog);
  registerCatalog("packages", packagesCatalog);
  subscribeServicesEvents(eventBus);
  registerServicesPorts();
  // F04: linked professionals for identity (F01) and professional counts for services (F03).
  registerProfessionalsPorts();
  // F06: real appointments for units (F02), services (F03), professionals (F04) and patients (F05).
  registerSchedulingPorts();
  // F07: the note state that scheduling shows in the appointment panel.
  registerClinicalRecordsPorts();
  // F09: charges react to the check-in, and a unit with charges cannot change country.
  subscribeBillingEvents(eventBus);
  registerBillingPorts();
  // F10: packages link appointments, debit sessions and cover the charge of linked appointments.
  subscribePackagesEvents(eventBus);
  registerPackagesPorts();
}
