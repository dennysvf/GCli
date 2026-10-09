import type { PackagesActions } from "@/modules/packages/client";
import {
  cancelPackageAction,
  eligiblePackagesAction,
  extendPackageAction,
  patientPackagesAction,
  saveTemplateAction,
  sellOptionsAction,
  sellPackageAction,
  seriesCoverageAction,
  setNoShowDebitAction,
  setTemplateActiveAction,
} from "./actions";

// The Server Actions the packages screens receive as props (the module's UI never imports `app/`).
export const packagesActions = {
  sellOptions: sellOptionsAction,
  sell: sellPackageAction,
  patientPackages: patientPackagesAction,
  extend: extendPackageAction,
  cancel: cancelPackageAction,
  eligible: eligiblePackagesAction,
  coverage: seriesCoverageAction,
  saveTemplate: saveTemplateAction,
  setTemplateActive: setTemplateActiveAction,
  setNoShowDebit: setNoShowDebitAction,
} as unknown as PackagesActions;
