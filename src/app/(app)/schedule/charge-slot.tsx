"use client";

import { ChargeSection } from "@/modules/billing/client";
import type { AppointmentStatus } from "@/modules/scheduling";
import { billingActions } from "../financial/billing-actions";

// The "Cobrança" section of the agenda panel: the app layer composes billing into scheduling's
// panel, so neither module imports the other (spec F09 section 3).
export function ChargeSlot({ appointmentId, status }: { appointmentId: string; status: AppointmentStatus }) {
  return <ChargeSection appointmentId={appointmentId} status={status} actions={billingActions} />;
}
