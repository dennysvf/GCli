"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { Button } from "@/shared/ui/components/button";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { PatientCharges } from "../application/queries";
import type { BillingActions } from "./billing-actions";
import { ChargesTable } from "./charges-table";
import { NewChargeDialog } from "./new-charge-dialog";
import { ReceiveDialog } from "./receive-dialog";
import { useMoney } from "./use-money";

type TabActions = Pick<
  BillingActions,
  "patientCharges" | "receiveOptions" | "receive" | "setDiscount" | "createCharge" | "newChargeOptions"
>;

// The "Financeiro" tab of the patient page (PRD F09 Experience): the open charges highlighted at
// the top with the total due, then the history of charges and payments.
export function BillingTab({
  patient,
  initial,
  timeZone,
  actions,
}: {
  patient: { id: string; displayName: string };
  initial: PatientCharges;
  timeZone: string;
  actions: TabActions;
}) {
  const t = useTranslations("billing.ui");
  const money = useMoney();
  const [data, setData] = useState(initial);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    const result = await actions.patientCharges({ patientId: patient.id });
    if (handleActionResult(result)) setData(result.data);
  }, [actions, patient.id]);

  const receivable = (status: string) => status === "OPEN" || status === "PARTIALLY_PAID";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title">{t("tabTitle")}</h2>
        <Button type="button" variant="outline" onClick={() => setCreating(true)}>
          {t("newCharge")}
        </Button>
      </div>

      <section className="bg-paper-1 grid gap-3 rounded-md border p-4" aria-label={t("openCharges")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{t("openCharges")}</h3>
          {data.dueByCurrency.length > 0 ? (
            <p className="font-mono font-semibold">
              {t("totalDue")}:{" "}
              {data.dueByCurrency.map((due) => money(due.balanceMinor, due.currency)).join(" · ")}
            </p>
          ) : null}
        </div>
        <ChargesTable
          charges={data.open}
          showPatient={false}
          timeZone={timeZone}
          emptyText={t("noOpenCharges")}
          rowAction={(charge) =>
            receivable(charge.status) ? (
              <Button type="button" size="sm" onClick={() => setReceiving(charge.id)}>
                {t("receive")}
              </Button>
            ) : null
          }
        />
      </section>

      <section className="grid gap-3" aria-label={t("history")}>
        <h3 className="font-semibold">{t("history")}</h3>
        <ChargesTable
          charges={data.history}
          showPatient={false}
          timeZone={timeZone}
          emptyText={t("noPatientCharges")}
        />
      </section>

      {receiving ? (
        <ReceiveDialog
          chargeId={receiving}
          actions={actions}
          onDone={() => void reload()}
          onClose={() => setReceiving(null)}
        />
      ) : null}
      {creating ? (
        <NewChargeDialog
          patient={patient}
          actions={actions}
          onCreated={() => void reload()}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}
