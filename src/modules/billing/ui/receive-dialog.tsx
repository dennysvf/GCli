"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { CountryCode, Currency } from "@/shared/kernel/countries/codes";
import { Alert } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/components/dialog";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { MoneyInput } from "@/shared/ui/forms/money-input";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { ReceiveResult } from "../application/payments";
import type { ReceiveOptions } from "../application/queries";
import type { ChargeView } from "../application/views";
import { MAX_INSTALLMENTS, MAX_PAYMENT_LINES } from "../domain/limits";
import type { DiscountInput } from "../domain/discount";
import type { BillingActions } from "./billing-actions";
import { ChargeStatusStamp } from "./charge-status";
import {
  basisPointsToText,
  percentToBasisPoints,
  previewDiscount,
  remainingMinor,
  sameDiscount,
  totalOf,
  type PaymentLine,
} from "./payment-lines";
import { useMoney } from "./use-money";

function ErrorText({ code, params }: { code: string; params?: Record<string, string> }) {
  const t = useTranslations();
  return <p className="text-destructive text-sm">{t(`billing.errors.${code}`, params)}</p>;
}

const DISCOUNT_INVALID = "BILLING_DISCOUNT_INVALID";
const REASON_REQUIRED = "BILLING_DISCOUNT_REASON_REQUIRED";
const CURRENCY_MISMATCH = "BILLING_CURRENCY_MISMATCH";
const PERCENT = "PERCENT" as const;
const AMOUNT = "AMOUNT" as const;
const CREDIT_CARD = "CREDIT_CARD";
const NONE = "none";

type Props = {
  chargeId: string;
  actions: Pick<BillingActions, "receiveOptions" | "receive" | "setDiscount">;
  onDone: (result: ReceiveResult | null) => void;
  onClose: () => void;
};

// The receive modal (PRD F09 Experience): the charge summary with the discount field, one or more
// payment lines, the balance that remains live, and "Confirmar recebimento". It loads what it
// needs in one read, then hands over to the form so every opening starts with fresh state.
export function ReceiveDialog(props: Props) {
  const t = useTranslations("billing.ui");
  const [options, setOptions] = useState<ReceiveOptions | null>(null);
  const { actions, chargeId, onClose } = props;

  useEffect(() => {
    let active = true;
    void actions.receiveOptions({ chargeId }).then((result) => {
      if (!active) return;
      if (handleActionResult(result)) setOptions(result.data);
      else onClose();
    });
    return () => {
      active = false;
    };
  }, [actions, chargeId, onClose]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {options ? (
          <ReceiveForm options={options} {...props} />
        ) : (
          <DialogHeader>
            <DialogTitle>{t("receiveTitle")}</DialogTitle>
            <DialogDescription>{t("loading")}</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

function newLine(method: string, amountMinor: number): PaymentLine {
  return { key: crypto.randomUUID(), method, amountMinor, installments: 1 };
}

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function ReceiveForm({ options, actions, onDone, onClose }: Props & { options: ReceiveOptions }) {
  const t = useTranslations("billing.ui");
  const tc = useTranslations();
  const money = useMoney();
  const [pending, startTransition] = useTransition();
  const charge: ChargeView = options.charge;
  const submissionKey = useRef(crypto.randomUUID());

  const [unitId, setUnitId] = useState(
    options.selectedUnitId && options.units.some((unit) => unit.id === options.selectedUnitId)
      ? options.selectedUnitId
      : (options.units.find((unit) => unit.currency === charge.currency)?.id ?? ""),
  );
  const unit = options.units.find((item) => item.id === unitId);
  const methods = unit ? (options.methodsByCountry[unit.country] ?? []) : [];

  const hasPayments = charge.payments.length > 0;
  const [kind, setKind] = useState<DiscountInput["kind"]>(charge.discount?.kind ?? PERCENT);
  const [percentText, setPercentText] = useState(
    charge.discount?.kind === PERCENT ? basisPointsToText(charge.discount.value) : "",
  );
  const [amountMinor, setAmountMinor] = useState(
    charge.discount?.kind === AMOUNT ? charge.discount.value : 0,
  );
  const [discountReason, setDiscountReason] = useState(charge.discountReason ?? "");
  const [approverId, setApproverId] = useState(NONE);
  const [pin, setPin] = useState("");
  const [rawLines, setLines] = useState<PaymentLine[]>([
    newLine(methods[0] ?? "", Math.max(charge.netMinor - charge.paidMinor, 0)),
  ]);
  const [receivedAt, setReceivedAt] = useState("");

  const discountValue =
    kind === PERCENT ? percentToBasisPoints(percentText) : amountMinor > 0 ? amountMinor : null;
  const discount: DiscountInput | null = discountValue ? { kind, value: discountValue } : null;
  const typedSomething = kind === PERCENT ? percentText.trim() !== "" : amountMinor > 0;
  const preview = previewDiscount(charge.grossMinor, discount);
  const discountInvalid = typedSomething && (!discount || !preview.valid);
  const changed = !sameDiscount(discount, charge.discount);
  const net = charge.grossMinor - (discount && preview.valid ? preview.discountMinor : 0);
  // While the user has not touched the amount of the only line, it follows the total after the discount.
  const [auto, setAuto] = useState(true);
  const lines =
    auto && rawLines.length === 1
      ? rawLines.map((line) => ({ ...line, amountMinor: Math.max(net - charge.paidMinor, 0) }))
      : rawLines;
  const remaining = remainingMinor(net, charge.paidMinor, lines);
  const over = remaining < 0;
  const needsReason = preview.needsReason && changed && discountReason.trim().length < 3;
  const needsApproval = changed && preview.needsApproval && !options.canApprove;
  const approverMissing = needsApproval && (approverId === NONE || !/^\d{6}$/.test(pin));
  const mismatch = unit !== undefined && unit.currency !== charge.currency;
  const pendingApproval = charge.status === "PENDING_APPROVAL";

  const lineError = lines.some(
    (line) => line.amountMinor <= 0 || !line.method || (line.method === CREDIT_CARD && line.installments < 1),
  );
  const blocked =
    pending ||
    over ||
    lineError ||
    !unit ||
    mismatch ||
    discountInvalid ||
    needsReason ||
    approverMissing ||
    (pendingApproval && !changed) ||
    totalOf(lines) <= 0;

  function updateLine(key: string, patch: Partial<PaymentLine>) {
    if (patch.amountMinor !== undefined) setAuto(false);
    setLines(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function changeUnit(next: string) {
    setUnitId(next);
    const country = options.units.find((item) => item.id === next)?.country;
    const allowed = country ? (options.methodsByCountry[country] ?? []) : [];
    setLines((current) =>
      current.map((line) => (allowed.includes(line.method) ? line : { ...line, method: allowed[0] ?? "" })),
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await actions.receive({
        chargeId: charge.id,
        submissionKey: submissionKey.current,
        unitId,
        ...(changed ? { version: charge.version, discount, discountReason: discountReason.trim() } : {}),
        ...(changed && needsApproval ? { approval: { approverUserId: approverId, pin } } : {}),
        ...(receivedAt ? { receivedAt: new Date(receivedAt).toISOString() } : {}),
        payments: lines.map((line) => ({
          method: line.method,
          amountMinor: line.amountMinor,
          ...(line.method === CREDIT_CARD ? { installments: line.installments } : {}),
        })),
      });
      if (!handleActionResult(result)) return;
      toast.success(t("paymentRegistered"), {
        action: { label: t("printReceipt"), onClick: () => window.open(result.data.receiptUrl, "_blank") },
      });
      onDone(result.data);
      onClose();
    });
  }

  function sendForApproval() {
    if (!discount) return;
    startTransition(async () => {
      const result = await actions.setDiscount({
        chargeId: charge.id,
        version: charge.version,
        discount,
        reason: discountReason.trim(),
        submitForApproval: true,
      });
      if (!handleActionResult(result, { successMessage: t("discountSentToast") })) return;
      onDone(null);
      onClose();
    });
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked) submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("receiveTitle")}</DialogTitle>
        <DialogDescription>
          {t("receiveSummary", { number: charge.number, patient: charge.patientName })}
        </DialogDescription>
      </DialogHeader>

      <section className="grid gap-2" aria-label={t("summary")}>
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">{charge.itemName}</span>
          <ChargeStatusStamp status={charge.status} />
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("gross")}</dt>
          <dd className="text-right font-mono">{money(charge.grossMinor, charge.currency)}</dd>
          <dt className="text-muted-foreground">{t("discount")}</dt>
          <dd className="text-right font-mono">
            {preview.discountMinor > 0 && !discountInvalid
              ? `− ${money(preview.discountMinor, charge.currency)}`
              : "—"}
          </dd>
          <dt className="font-semibold">{t("net")}</dt>
          <dd className="text-right font-mono font-semibold">{money(net, charge.currency)}</dd>
          {charge.paidMinor > 0 ? (
            <>
              <dt className="text-muted-foreground">{t("alreadyReceived")}</dt>
              <dd className="text-right font-mono">{money(charge.paidMinor, charge.currency)}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="grid gap-3" aria-label={t("discount")}>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <div className="grid gap-1">
            <Label htmlFor="discount-kind">{t("discount")}</Label>
            <Select
              value={kind}
              onValueChange={(value) => setKind(value as DiscountInput["kind"])}
              disabled={hasPayments}
            >
              <SelectTrigger id="discount-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PERCENT}>{t("percent")}</SelectItem>
                <SelectItem value={AMOUNT}>{t("amount")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="discount-value">{kind === PERCENT ? t("percentValue") : t("amountValue")}</Label>
            {kind === PERCENT ? (
              <Input
                id="discount-value"
                inputMode="decimal"
                autoComplete="off"
                value={percentText}
                disabled={hasPayments}
                onChange={(event) => setPercentText(event.target.value)}
                aria-invalid={discountInvalid}
              />
            ) : (
              <MoneyInput
                id="discount-value"
                currency={charge.currency as Currency}
                {...(unit ? { country: unit.country as CountryCode } : {})}
                value={amountMinor}
                disabled={hasPayments}
                onChange={setAmountMinor}
                aria-invalid={discountInvalid}
              />
            )}
          </div>
        </div>
        {discountInvalid ? <ErrorText code={DISCOUNT_INVALID} /> : null}
        {hasPayments ? <p className="text-muted-foreground text-xs">{t("discountLocked")}</p> : null}
        {changed && preview.needsReason ? (
          <div className="grid gap-1">
            <Label htmlFor="discount-reason">{t("discountReason")}</Label>
            <Input
              id="discount-reason"
              value={discountReason}
              maxLength={500}
              onChange={(event) => setDiscountReason(event.target.value)}
              aria-invalid={needsReason}
            />
            {needsReason ? <ErrorText code={REASON_REQUIRED} /> : null}
          </div>
        ) : null}
        {needsApproval ? (
          <Alert variant="warning" className="grid gap-3">
            <p>{t("needsApproval")}</p>
            {options.approvers.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="approver">{t("approver")}</Label>
                  <Select value={approverId} onValueChange={setApproverId}>
                    <SelectTrigger id="approver">
                      <SelectValue placeholder={t("chooseApprover")} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.approvers.map((approver) => (
                        <SelectItem key={approver.id} value={approver.id}>
                          {approver.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="approver-pin">{t("pin")}</Label>
                  <Input
                    id="approver-pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm">{t("noApprovers")}</p>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={pending || discountInvalid || needsReason}
                onClick={sendForApproval}
              >
                {t("sendForApproval")}
              </Button>
            </div>
          </Alert>
        ) : null}
      </section>

      <section className="grid gap-3" aria-label={t("payments")}>
        {options.units.length > 1 || !unit ? (
          <div className="grid gap-1">
            <Label htmlFor="payment-unit">{t("paymentUnit")}</Label>
            <Select value={unitId} onValueChange={changeUnit}>
              <SelectTrigger id="payment-unit">
                <SelectValue placeholder={t("chooseUnit")} />
              </SelectTrigger>
              <SelectContent>
                {options.units.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {mismatch && unit ? (
          <Alert variant="destructive">
            <ErrorText
              code={CURRENCY_MISMATCH}
              params={{ currency: unit.currency, chargeCurrency: charge.currency }}
            />
          </Alert>
        ) : null}

        {lines.map((line, index) => (
          <div key={line.key} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_5rem_auto]">
            <div className="grid gap-1">
              <Label htmlFor={`method-${line.key}`}>{t("method")}</Label>
              <Select value={line.method} onValueChange={(value) => updateLine(line.key, { method: value })}>
                <SelectTrigger id={`method-${line.key}`}>
                  <SelectValue placeholder={t("chooseMethod")} />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((method) => (
                    <SelectItem key={method} value={method}>
                      {tc(`countries.paymentMethods.${method}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`amount-${line.key}`}>{t("lineAmount")}</Label>
              <MoneyInput
                id={`amount-${line.key}`}
                currency={charge.currency as Currency}
                {...(unit ? { country: unit.country as CountryCode } : {})}
                value={line.amountMinor}
                onChange={(value) => updateLine(line.key, { amountMinor: value })}
              />
            </div>
            {line.method === CREDIT_CARD ? (
              <div className="grid gap-1">
                <Label htmlFor={`installments-${line.key}`}>{t("installments")}</Label>
                <Input
                  id={`installments-${line.key}`}
                  type="number"
                  min={1}
                  max={MAX_INSTALLMENTS}
                  value={line.installments}
                  onChange={(event) =>
                    updateLine(line.key, {
                      installments: Math.min(MAX_INSTALLMENTS, Math.max(1, Number(event.target.value) || 1)),
                    })
                  }
                />
              </div>
            ) : (
              <span />
            )}
            {lines.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAuto(false);
                  setLines(lines.filter((item) => item.key !== line.key));
                }}
                aria-label={t("removeLine", { number: index + 1 })}
              >
                {t("remove")}
              </Button>
            ) : (
              <span />
            )}
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="ghost"
            disabled={lines.length >= MAX_PAYMENT_LINES}
            onClick={() => {
              setAuto(false);
              setLines([...lines, newLine(methods[0] ?? "", Math.max(remaining, 0))]);
            }}
          >
            {t("addPayment")}
          </Button>
        </div>
        {options.canApprove ? (
          <div className="grid gap-1 sm:w-72">
            <Label htmlFor="received-at">{t("paymentDate")}</Label>
            <Input
              id="received-at"
              type="datetime-local"
              value={receivedAt}
              {...(unit
                ? {
                    min: toLocalInput(
                      options.units.find((u) => u.id === unitId)?.minReceivedAt ?? new Date().toISOString(),
                    ),
                  }
                : {})}
              max={toLocalInput(new Date().toISOString())}
              onChange={(event) => setReceivedAt(event.target.value)}
            />
          </div>
        ) : null}
        <p
          className={over ? "text-destructive text-sm font-semibold" : "text-sm font-semibold"}
          aria-live="polite"
          role={over ? "alert" : undefined}
        >
          {over
            ? t("overpayment", {
                amount: money(totalOf(lines), charge.currency),
                balance: money(net - charge.paidMinor, charge.currency),
              })
            : t("remaining", { amount: money(remaining, charge.currency) })}
        </p>
      </section>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={blocked}>
          {t("confirmReceipt")}
        </Button>
      </DialogFooter>
    </form>
  );
}
