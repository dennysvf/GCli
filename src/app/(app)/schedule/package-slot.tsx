"use client";

import { PackageChoice } from "@/modules/packages/client";
import type { PackageChoiceSlot } from "@/modules/scheduling";
import { packagesActions } from "../packages/package-actions";

// "Usar pacote" in the booking and edit forms: the app layer composes packages into scheduling's
// forms, so neither module imports the other (spec F10 section 3).
export const PackageSlot: PackageChoiceSlot = (props) => (
  <PackageChoice {...props} actions={packagesActions} />
);
