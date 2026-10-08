"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import type { Currency } from "@/shared/kernel/countries/codes";
import { Button } from "@/shared/ui/components/button";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { MoneyInput } from "@/shared/ui/forms/money-input";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import { Stamp } from "@/shared/ui/components/stamp";
import type { ChargeDetail } from "../application/queries";
import type { PaymentView } from "../application/views";
import type { BillingActions } from "./billing-actions";
import { ChargeStatusStamp } from "./charge-status";
import { ReasonDialog } from "./reason-dialog";
import { ReceiveDialog } from "./receive-dialog";
import { useMoney } from "./use-money";

const refundOf = (payment: PaymentView): Dialog => ({ kind: "refund", payment });

type DetailActions = Pick<
  BillingActions,
  "detail" | "receiveOptions" | "receive" | "setDiscount" | "approve" | "reject" | "refund" | "void"
>;

const RECEIVE = { kind: "receive" } as const;
const REJECT = { kind: "reject" } as const;
const VOID = { kind: "void" } as const;

type Dialog =
  | { kind: "receive" }
  | { kind: "refund"; payment: PaymentView }
  | { kind: "void" }
  | { kind: "reject" }
  | null;

// A charge in full: the summary, the discount, the payments with their refunds and the actions
// the user may take (PRD F09 Experience). Refunds, voids and approvals are for managers only.
export function ChargeDetailView({
  initial,
  timeZone,
  canApprove,
  units,
  selectedUnitId,
  actions,
}: {
  initial: ChargeDetail;
  timeZone: string;
  canApprove: boolean;
  units: { id: string; name: string; currency: string }[];
  selectedUnitId: string | null;
  actions: DetailActions;
}) {
  const t = useTranslations("billing.ui");
  const tc = useTranslations();
  const money = useMoney();
  const format = useFormatters();
  const [data, setData] = useState(initial);
  const [dialog, setDialog] = useState<Dialog>(null);
  const charge = data.charge;

  const reload = useCallback(async () => {
    const result = await actions.detail({ chargeId: charge.id });
    if (handleActionResult(result)) setData(result.data);
  }, [actions, charge.id]);

  const canReceive = charge.status === "OPEN" || charge.status === "PARTIALLY_PAID";
  const canVoid = canApprove && charge.status !== "CANCELLED" && charge.paidMinor === 0;
  const pending = charge.pendingRequest;

  async function approve() {
    const result = await actions.approve({ chargeId: charge.id, version: charge.version });
    if (handleActionResult(result, { successMessage: t("discountApprovedToast") })) await reload();
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <ChargeStatusStamp status={charge.status} />
          <span className="text-muted-foreground text-sm">
            {t("createdAt", { date: format.dateTime(charge.createdAt, timeZone) })}
          </span>
        </div>
        <dl className="grid max-w-xl grid-cols-[10rem_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("columnPatient")}</dt>
          <dd>{charge.patientName}</dd>
          <dt className="text-muted-foreground">{t("columnItem")}</dt>
          <dd>{charge.itemName}</dd>
          {charge.professionalName ? (
            <>
              <dt className="text-muted-foreground">{t("professional")}</dt>
              <dd>{charge.professionalName}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">{t("chargeUnit")}</dt>
          <dd>{charge.unitName}</dd>
          <dt className="text-muted-foreground">{t("gross")}</dt>
          <dd className="font-mono">{money(charge.grossMinor, charge.currency)}</dd>
          <dt className="text-muted-foreground">{t("discount")}</dt>
          <dd className="font-mono">
            {charge.discountMinor > 0 ? `− ${money(charge.discountMinor, charge.currency)}` : "—"}
            {charge.discountReason ? (
              <span className="text-muted-foreground font-sans"> · {charge.discountReason}</span>
            ) : null}
          </dd>
          <dt className="font-semibold">{t("net")}</dt>
          <dd className="font-mono font-semibold">{money(charge.netMinor, charge.currency)}</dd>
          <dt className="text-muted-foreground">{t("received")}</dt>
          <dd className="font-mono">{money(charge.paidMinor, charge.currency)}</dd>
          <dt className="text-muted-foreground">{t("balanceColumn")}</dt>
          <dd className="font-mono">{money(charge.balanceMinor, charge.currency)}</dd>
          {charge.cancelReason ? (
            <>
              <dt className="text-muted-foreground">{t("cancelReason")}</dt>
              <dd>{charge.cancelReason}</dd>
            </>
          ) : null}
        </dl>
        {pending ? (
          <p className="text-sm">
            {t("pendingRequest", {
              value:
                pending.kind === "PERCENT"
                  ? `${pending.value / 100}%`
                  : money(pending.value, charge.currency),
              user: pending.requestedByName,
            })}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canReceive ? (
            <Button type="button" onClick={() => setDialog(RECEIVE)}>
              {t("receive")}
            </Button>
          ) : null}
          {pending && canApprove ? (
            <>
              <Button type="button" onClick={() => void approve()}>
                {t("approve")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialog(REJECT)}>
                {t("reject")}
              </Button>
            </>
          ) : null}
          {charge.payments.length > 0 ? (
            <Button asChild variant="outline">
              <a href={`/api/billing/charges/${charge.id}/receipt`} target="_blank" rel="noreferrer">
                {t("receipt")}
              </a>
            </Button>
          ) : null}
          {canVoid ? (
            <Button type="button" variant="ghost" onClick={() => setDialog(VOID)}>
              {t("voidCharge")}
            </Button>
          ) : null}
        </div>
      </section>

      <section className="grid gap-2" aria-label={t("payments")}>
        <h2 className="section-title">{t("payments")}</h2>
        {charge.payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noPayments")}</p>
        ) : (
          <div className="border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columnDate")}</TableHead>
                  <TableHead>{t("method")}</TableHead>
                  <TableHead>{t("paymentUnit")}</TableHead>
                  <TableHead>{t("by")}</TableHead>
                  <TableHead className="text-right">{t("lineAmount")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("columnActions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charge.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{format.dateTime(payment.receivedAt, timeZone)}</TableCell>
                    <TableCell>
                      {tc(`countries.paymentMethods.${payment.method}`)}
                      {payment.installments && payment.installments > 1
                        ? ` (${tc("billing.receipt.installments", { count: payment.installments })})`
                        : ""}
                      {payment.kind === "REFUND" ? (
                        <>
                          {" "}
                          <Stamp variant="warning">{t("refundStamp")}</Stamp>
                        </>
                      ) : null}
                      {payment.kind === "PAYMENT" && payment.refundedMinor > 0 ? (
                        <>
                          {" "}
                          <Stamp variant="neutral">
                            {payment.refundedMinor >= payment.amountMinor
                              ? t("refunded")
                              : t("refundedPartly")}
                          </Stamp>
                        </>
                      ) : null}
                      {payment.reason ? (
                        <span className="text-muted-foreground"> · {payment.reason}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{payment.unitName}</TableCell>
                    <TableCell>{payment.userName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {money(payment.amountMinor, charge.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {canApprove &&
                      payment.kind === "PAYMENT" &&
                      payment.refundedMinor < payment.amountMinor ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setDialog(refundOf(payment))}
                        >
                          {t("refund")}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {data.requests.length > 0 ? (
        <section className="grid gap-2" aria-label={t("discountHistory")}>
          <h2 className="section-title">{t("discountHistory")}</h2>
          <div className="border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columnDate")}</TableHead>
                  <TableHead>{t("discount")}</TableHead>
                  <TableHead>{t("by")}</TableHead>
                  <TableHead>{t("columnStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{format.dateTime(request.requestedAt, timeZone)}</TableCell>
                    <TableCell className="font-mono">
                      {money(request.discountMinor, charge.currency)}
                    </TableCell>
                    <TableCell>{request.requestedByName}</TableCell>
                    <TableCell>
                      {tc(`billing.ui.requestStatus.${request.status}`)}
                      {request.decidedByName ? ` · ${request.decidedByName}` : ""}
                      {request.rejectionReason ? ` · ${request.rejectionReason}` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {dialog?.kind === "receive" ? (
        <ReceiveDialog
          chargeId={charge.id}
          actions={actions}
          onDone={() => void reload()}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "void" ? (
        <ReasonDialog
          title={t("voidTitle")}
          description={t("voidHint")}
          confirmLabel={t("voidCharge")}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            const result = await actions.void({ chargeId: charge.id, reason });
            const done = handleActionResult(result, { successMessage: t("voidedToast") });
            if (done) await reload();
            return done;
          }}
        />
      ) : null}
      {dialog?.kind === "reject" ? (
        <ReasonDialog
          title={t("rejectTitle")}
          description={t("rejectHint")}
          confirmLabel={t("reject")}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            const result = await actions.reject({ chargeId: charge.id, version: charge.version, reason });
            const done = handleActionResult(result, { successMessage: t("discountRejectedToast") });
            if (done) await reload();
            return done;
          }}
        />
      ) : null}
      {dialog?.kind === "refund" ? (
        <RefundDialog
          chargeId={charge.id}
          currency={charge.currency}
          payment={dialog.payment}
          units={units.filter((unit) => unit.currency === charge.currency)}
          defaultUnitId={selectedUnitId}
          refund={actions.refund}
          onDone={() => void reload()}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

function RefundDialog({
  chargeId,
  currency,
  payment,
  units,
  defaultUnitId,
  refund,
  onDone,
  onClose,
}: {
  chargeId: string;
  currency: string;
  payment: PaymentView;
  units: { id: string; name: string }[];
  defaultUnitId: string | null;
  refund: BillingActions["refund"];
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("billing.ui");
  const money = useMoney();
  const available = payment.amountMinor - payment.refundedMinor;
  const [amount, setAmount] = useState(available);
  const [unitId, setUnitId] = useState(
    units.find((unit) => unit.id === defaultUnitId)?.id ?? units[0]?.id ?? "",
  );

  return (
    <ReasonDialog
      title={t("refundTitle")}
      description={t("refundHint", { amount: money(available, currency) })}
      confirmLabel={t("refund")}
      onClose={onClose}
      onConfirm={async (reason) => {
        const result = await refund({
          chargeId,
          paymentId: payment.id,
          amountMinor: amount,
          reason,
          unitId,
        });
        const done = handleActionResult(result, { successMessage: t("refundedToast") });
        if (done) onDone();
        return done;
      }}
    >
      <div className="grid gap-1">
        <Label htmlFor="refund-amount">{t("refundAmount")}</Label>
        <MoneyInput id="refund-amount" currency={currency as Currency} value={amount} onChange={setAmount} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="refund-unit">{t("paymentUnit")}</Label>
        <Select value={unitId} onValueChange={setUnitId}>
          <SelectTrigger id="refund-unit">
            <SelectValue placeholder={t("chooseUnit")} />
          </SelectTrigger>
          <SelectContent>
            {units.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {unit.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </ReasonDialog>
  );
}
