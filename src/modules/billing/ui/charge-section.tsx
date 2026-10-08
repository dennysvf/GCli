"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/ui/components/button";
import type { ChargeView } from "../application/views";
import type { BillingActions } from "./billing-actions";
import { ChargeStatusStamp } from "./charge-status";
import { ReceiveDialog } from "./receive-dialog";
import { useMoney } from "./use-money";

// The "Cobrança" section of the agenda side panel (PRD F09 Experience): the status, the amount
// and the balance, with "Receber" and the receipt. It loads its own data once the patient arrived.
export function ChargeSection({
  appointmentId,
  status,
  actions,
}: {
  appointmentId: string;
  status: string;
  actions: Pick<BillingActions, "appointmentCharge" | "receiveOptions" | "receive" | "setDiscount">;
}) {
  const t = useTranslations("billing.ui");
  const money = useMoney();
  const [charge, setCharge] = useState<ChargeView | null | undefined>(undefined);
  const [receiving, setReceiving] = useState(false);

  const load = useCallback(async () => {
    const result = await actions.appointmentCharge({ appointmentId });
    setCharge(result.ok ? result.data : null);
  }, [actions, appointmentId]);

  // The status is part of the dependencies: a check-in made in the panel creates the charge.
  useEffect(() => {
    let active = true;
    void actions.appointmentCharge({ appointmentId }).then((result) => {
      if (active) setCharge(result.ok ? result.data : null);
    });
    return () => {
      active = false;
    };
  }, [actions, appointmentId, status]);

  if (charge === undefined) return null;
  const canReceive =
    !!charge &&
    charge.status !== "PAID" &&
    charge.status !== "CANCELLED" &&
    charge.status !== "PENDING_APPROVAL";
  const hasPayments = !!charge && charge.paidMinor > 0;

  return (
    <section className="grid gap-2" aria-label={t("sectionTitle")}>
      <h3 className="section-title">{t("sectionTitle")}</h3>
      {charge ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ChargeStatusStamp status={charge.status} />
            <span className="font-mono font-semibold">{money(charge.netMinor, charge.currency)}</span>
          </div>
          {charge.balanceMinor > 0 && charge.status !== "CANCELLED" ? (
            <p className="text-muted-foreground text-sm">
              {t("balance", { amount: money(charge.balanceMinor, charge.currency) })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {canReceive ? (
              <Button type="button" onClick={() => setReceiving(true)}>
                {t("receive")}
              </Button>
            ) : null}
            {hasPayments ? (
              <Button asChild variant="ghost">
                <a href={`/api/billing/charges/${charge.id}/receipt`} target="_blank" rel="noreferrer">
                  {t("receipt")}
                </a>
              </Button>
            ) : null}
          </div>
          {receiving ? (
            <ReceiveDialog
              chargeId={charge.id}
              actions={actions}
              onDone={() => void load()}
              onClose={() => setReceiving(false)}
            />
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("noCharge")}</p>
      )}
    </section>
  );
}
