"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReceiveDialog } from "@/modules/billing/client";
import { PackagesSection, type PackagesActions } from "@/modules/packages/client";
import type { PatientPackages } from "@/modules/packages";
import { billingActions } from "../../financial/billing-actions";

// The packages of the patient with the F09 receive modal for "Receber agora": the app layer composes
// both modules, so neither imports the other's UI (spec F10 section 3).
export function PackagesPanel({
  patient,
  initial,
  timeZone,
  canApprove,
  actions,
}: {
  patient: { id: string; displayName: string };
  initial: PatientPackages;
  timeZone: string;
  canApprove: boolean;
  actions: PackagesActions;
}) {
  const router = useRouter();
  const [receiving, setReceiving] = useState<string | null>(null);
  return (
    <>
      <PackagesSection
        patient={patient}
        initial={initial}
        timeZone={timeZone}
        canApprove={canApprove}
        actions={actions}
        onReceiveCharge={setReceiving}
      />
      {receiving ? (
        <ReceiveDialog
          chargeId={receiving}
          actions={billingActions}
          onDone={() => router.refresh()}
          onClose={() => setReceiving(null)}
        />
      ) : null}
    </>
  );
}
