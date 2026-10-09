"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import type { Currency } from "@/shared/kernel/countries/codes";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
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
import { Stamp, type StampVariant } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { Textarea } from "@/shared/ui/components/textarea";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { MoneyInput } from "@/shared/ui/forms/money-input";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { PatientPackages, SellOptions } from "../application/queries";
import type { PackageCard } from "../application/views";
import type { PackagesActions } from "./packages-actions";

const DISCOUNT_REASON_ABOVE_PERCENT = 10; // PRD F09
const DISCOUNT_APPROVAL_ABOVE_PERCENT = 20; // PRD F09
const NONE = "none";
const NO_PRICE = "PACKAGE_NO_PRICE_FOR_CURRENCY";
const PRICE_ABOVE = "PACKAGE_PRICE_ABOVE_TEMPLATE";

function ErrorText({ code, params }: { code: string; params?: Record<string, string> }) {
  const t = useTranslations();
  return <p className="text-destructive text-sm">{t(`packages.errors.${code}`, params)}</p>;
}

const STATUS_TONES: Record<string, StampVariant> = {
  ACTIVE: "success",
  EXPIRED: "warning",
  CANCELLED: "cancelled",
};
const CHARGE_TONES: Record<string, StampVariant> = {
  PENDING_APPROVAL: "warning",
  OPEN: "neutral",
  PARTIALLY_PAID: "info",
  PAID: "success",
  CANCELLED: "cancelled",
};

type SectionActions = Pick<PackagesActions, "sellOptions" | "sell" | "patientPackages" | "extend" | "cancel">;

// The "Pacotes" section of the patient's Financeiro tab (PRD F10 Experience): a card per package
// with its progress, validity, payment and linked appointments, and the actions to sell, extend and cancel.
export function PackagesSection({
  patient,
  initial,
  timeZone,
  canApprove,
  actions,
  onReceiveCharge,
}: {
  patient: { id: string; displayName: string };
  initial: PatientPackages;
  timeZone: string;
  canApprove: boolean;
  actions: SectionActions;
  onReceiveCharge: (chargeId: string) => void;
}) {
  const t = useTranslations("packages.ui");
  const [data, setData] = useState(initial);
  const [selling, setSelling] = useState(false);
  const [extending, setExtending] = useState<PackageCard | null>(null);
  const [cancelling, setCancelling] = useState<PackageCard | null>(null);

  const reload = useCallback(async () => {
    const result = await actions.patientPackages({ patientId: patient.id });
    if (handleActionResult(result)) setData(result.data);
  }, [actions, patient.id]);

  const ordered = [...data.packages].sort(
    (a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE"),
  );

  return (
    <section className="grid gap-4" aria-label={t("sectionTitle")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{t("sectionTitle")}</h3>
        <Button type="button" variant="outline" onClick={() => setSelling(true)}>
          {t("sell")}
        </Button>
      </div>
      {ordered.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noPackages")}</p>
      ) : (
        <div className="grid gap-4">
          {ordered.map((card) => (
            <PackageCardView
              key={card.id}
              card={card}
              timeZone={timeZone}
              canApprove={canApprove}
              onExtend={() => setExtending(card)}
              onCancel={() => setCancelling(card)}
              onReceive={() => onReceiveCharge(card.chargeId)}
            />
          ))}
        </div>
      )}
      {selling ? (
        <SellDialog
          patient={patient}
          actions={actions}
          onSold={() => void reload()}
          onReceive={onReceiveCharge}
          onClose={() => setSelling(false)}
        />
      ) : null}
      {extending ? (
        <ExtendDialog
          card={extending}
          actions={actions}
          onDone={() => void reload()}
          onClose={() => setExtending(null)}
        />
      ) : null}
      {cancelling ? (
        <CancelDialog
          card={cancelling}
          actions={actions}
          onDone={() => void reload()}
          onClose={() => setCancelling(null)}
        />
      ) : null}
    </section>
  );
}

function PackageCardView({
  card,
  timeZone,
  canApprove,
  onExtend,
  onCancel,
  onReceive,
}: {
  card: PackageCard;
  timeZone: string;
  canApprove: boolean;
  onExtend: () => void;
  onCancel: () => void;
  onReceive: () => void;
}) {
  const t = useTranslations("packages.ui");
  const tc = useTranslations();
  const format = useFormatters();
  const percent = Math.round((card.usedSessions / card.totalSessions) * 100);
  const payable = card.chargeStatus === "OPEN" || card.chargeStatus === "PARTIALLY_PAID";

  return (
    <article className="grid gap-3 rounded-md border p-4" aria-label={card.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid">
          <h4 className="font-semibold">{card.name}</h4>
          <span className="text-muted-foreground text-sm">{card.serviceName}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Stamp variant={STATUS_TONES[card.status] ?? "neutral"}>
            {tc(`packages.status.${card.status}`)}
          </Stamp>
          {card.chargeStatus ? (
            <Stamp variant={CHARGE_TONES[card.chargeStatus] ?? "neutral"}>
              {tc(`billing.status.${card.chargeStatus}`)}
            </Stamp>
          ) : null}
        </div>
      </div>
      <div className="grid gap-1">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={card.totalSessions}
          aria-valuenow={card.usedSessions}
          aria-label={t("progress", { used: card.usedSessions, total: card.totalSessions })}
          className="bg-muted h-2 overflow-hidden rounded-xs"
        >
          <div className="bg-primary h-full" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-sm">
          {t("progress", { used: card.usedSessions, total: card.totalSessions })}
          <span className="text-muted-foreground">
            {" "}
            · {t("validUntil", { date: format.shortDate(card.expiresOn) })}
          </span>
        </p>
      </div>
      {card.links.length > 0 ? (
        <div className="border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("session")}</TableHead>
                <TableHead>{t("dateTime")}</TableHead>
                <TableHead>{t("professional")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {card.links.map((link) => (
                <TableRow key={link.id}>
                  <TableCell>{link.session ?? "—"}</TableCell>
                  <TableCell>
                    {link.startsAt ? (
                      <Link
                        href={`/schedule?appointment=${link.appointmentId}&date=${dateInTimeZone(new Date(link.startsAt), link.unitTimeZone ?? timeZone)}`}
                        className="text-primary hover:underline"
                      >
                        {format.dateTime(link.startsAt, link.unitTimeZone ?? timeZone)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{link.professionalName ?? "—"}</TableCell>
                  <TableCell>
                    {link.flagged
                      ? t("flagged")
                      : link.appointmentStatus
                        ? tc(`scheduling.ui.status.${link.appointmentStatus}`)
                        : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {payable ? (
          <Button type="button" size="sm" onClick={onReceive}>
            {t("receiveNow")}
          </Button>
        ) : null}
        {canApprove && card.status === "ACTIVE" ? (
          <>
            <Button type="button" size="sm" variant="outline" onClick={onExtend}>
              {t("extend")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              {t("cancelPackage")}
            </Button>
          </>
        ) : null}
      </div>
    </article>
  );
}

function SellDialog({
  patient,
  actions,
  onSold,
  onReceive,
  onClose,
}: {
  patient: { id: string; displayName: string };
  actions: Pick<PackagesActions, "sellOptions" | "sell">;
  onSold: () => void;
  onReceive: (chargeId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("packages.ui");
  const format = useFormatters();
  const [options, setOptions] = useState<SellOptions | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [price, setPrice] = useState(0);
  const [reason, setReason] = useState("");
  const [approverId, setApproverId] = useState(NONE);
  const [pin, setPin] = useState("");
  const [sold, setSold] = useState<{ chargeId: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void actions.sellOptions({}).then((result) => {
      if (!active) return;
      if (!handleActionResult(result)) return onClose();
      setOptions(result.data);
      setUnitId(result.data.selectedUnitId ?? result.data.units[0]?.id ?? "");
    });
    return () => {
      active = false;
    };
  }, [actions, onClose]);

  const template = options?.templates.find((item) => item.id === templateId);
  const unit = options?.units.find((item) => item.id === unitId);
  const templatePrice = template?.prices.find((item) => item.currency === unit?.currency)?.amountMinor ?? 0;
  const discount = templatePrice > 0 && price > 0 ? Math.max(templatePrice - price, 0) : 0;
  const needsReason = discount * 100 > templatePrice * DISCOUNT_REASON_ABOVE_PERCENT;
  const needsApproval =
    discount * 100 > templatePrice * DISCOUNT_APPROVAL_ABOVE_PERCENT && !options?.canApprove;
  const approvalReady = approverId !== NONE && /^\d{6}$/.test(pin);
  const priceInvalid = price <= 0 || price > templatePrice;
  const blocked =
    pending ||
    !template ||
    !unit ||
    templatePrice === 0 ||
    priceInvalid ||
    (needsReason && reason.trim().length < 3);

  function pick(id: string, currency: string | undefined) {
    setTemplateId(id);
    const found = options?.templates.find((item) => item.id === id);
    setPrice(found?.prices.find((item) => item.currency === currency)?.amountMinor ?? 0);
  }

  function submit(sendForApproval: boolean) {
    startTransition(async () => {
      const result = await actions.sell({
        patientId: patient.id,
        templateId,
        unitId,
        priceMinor: price,
        ...(discount > 0 ? { discountReason: reason.trim() } : {}),
        ...(needsApproval && !sendForApproval ? { approval: { approverUserId: approverId, pin } } : {}),
        ...(sendForApproval ? { submitForApproval: true } : {}),
      });
      if (!handleActionResult(result, { successMessage: t("soldToast") })) return;
      onSold();
      setSold({ chargeId: result.data.charge.id });
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {sold ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("soldTitle")}</DialogTitle>
              <DialogDescription>{t("soldHint")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("close")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onClose();
                  onReceive(sold.chargeId);
                }}
              >
                {t("receiveNow")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!blocked && !(needsApproval && !approvalReady)) submit(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("sell")}</DialogTitle>
              <DialogDescription>{t("sellHint", { patient: patient.displayName })}</DialogDescription>
            </DialogHeader>
            {options ? (
              <>
                <div className="grid gap-1">
                  <Label htmlFor="sale-template">{t("template")}</Label>
                  <Select value={templateId} onValueChange={(id) => pick(id, unit?.currency)}>
                    <SelectTrigger id="sale-template">
                      <SelectValue placeholder={t("chooseTemplate")} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.templates.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {options.units.length > 1 ? (
                  <div className="grid gap-1">
                    <Label htmlFor="sale-unit">{t("unit")}</Label>
                    <Select
                      value={unitId}
                      onValueChange={(id) => {
                        setUnitId(id);
                        pick(templateId, options.units.find((item) => item.id === id)?.currency);
                      }}
                    >
                      <SelectTrigger id="sale-unit">
                        <SelectValue />
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
                {template && unit && templatePrice === 0 ? (
                  <ErrorText code={NO_PRICE} params={{ currency: unit.currency }} />
                ) : null}
                {template && templatePrice > 0 && unit ? (
                  <>
                    <div className="grid gap-1">
                      <Label htmlFor="sale-price">{t("salePrice")}</Label>
                      <MoneyInput
                        id="sale-price"
                        currency={unit.currency as Currency}
                        value={price}
                        onChange={setPrice}
                        aria-invalid={priceInvalid}
                      />
                      <p className="text-muted-foreground text-xs">
                        {t("perSession", {
                          price: format.money({
                            amountMinor: Math.floor(price / template.sessions),
                            currency: unit.currency as Currency,
                          }),
                        })}
                      </p>
                      {price > templatePrice ? <ErrorText code={PRICE_ABOVE} /> : null}
                    </div>
                    {discount > 0 && needsReason ? (
                      <div className="grid gap-1">
                        <Label htmlFor="sale-reason">{t("discountReason")}</Label>
                        <Input
                          id="sale-reason"
                          value={reason}
                          maxLength={500}
                          onChange={(event) => setReason(event.target.value)}
                        />
                      </div>
                    ) : null}
                    {needsApproval ? (
                      <Alert variant="warning" className="grid gap-3">
                        <p>{t("needsApproval")}</p>
                        {options.approvers.length > 0 ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="grid gap-1">
                              <Label htmlFor="sale-approver">{t("approver")}</Label>
                              <Select value={approverId} onValueChange={setApproverId}>
                                <SelectTrigger id="sale-approver">
                                  <SelectValue placeholder={t("chooseApprover")} />
                                </SelectTrigger>
                                <SelectContent>
                                  {options.approvers.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid gap-1">
                              <Label htmlFor="sale-pin">{t("pin")}</Label>
                              <Input
                                id="sale-pin"
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
                            disabled={blocked}
                            onClick={() => submit(true)}
                          >
                            {t("sendForApproval")}
                          </Button>
                        </div>
                      </Alert>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={blocked || (needsApproval && !approvalReady)}>
                {t("sell")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReasonFields({
  title,
  description,
  confirmLabel,
  danger,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger: boolean;
  children?: ReactNode;
  onConfirm: (reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useTranslations("packages.ui");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const valid = reason.trim().length >= 3;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid || pending) return;
            startTransition(async () => {
              if (await onConfirm(reason.trim())) onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <div className="grid gap-1">
            <Label htmlFor="package-reason">{t("reason")}</Label>
            <Textarea
              id="package-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant={danger ? "destructive" : "default"} disabled={!valid || pending}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExtendDialog({
  card,
  actions,
  onDone,
  onClose,
}: {
  card: PackageCard;
  actions: Pick<PackagesActions, "extend">;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("packages.ui");
  const [days, setDays] = useState("30");
  return (
    <ReasonFields
      title={t("extend")}
      description={t("extendHint", { name: card.name })}
      confirmLabel={t("extend")}
      danger={false}
      onClose={onClose}
      onConfirm={async (reason) => {
        const result = await actions.extend({
          packageId: card.id,
          version: card.version,
          days: Number(days),
          reason,
        });
        const done = handleActionResult(result, { successMessage: t("extendedToast") });
        if (done) onDone();
        return done;
      }}
    >
      <div className="grid gap-1">
        <Label htmlFor="extend-days">{t("days")}</Label>
        <Input
          id="extend-days"
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(event) => setDays(event.target.value)}
        />
      </div>
    </ReasonFields>
  );
}

function CancelDialog({
  card,
  actions,
  onDone,
  onClose,
}: {
  card: PackageCard;
  actions: Pick<PackagesActions, "cancel">;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("packages.ui");
  // The confirmation sentence of the server (it carries the number of linked appointments).
  const [confirmation, setConfirmation] = useState<string | null>(null);
  return (
    <ReasonFields
      title={t("cancelPackage")}
      description={t("cancelHint")}
      confirmLabel={confirmation === null ? t("cancelPackage") : t("confirmCancel")}
      danger
      onClose={onClose}
      onConfirm={async (reason) => {
        const result = await actions.cancel({
          packageId: card.id,
          version: card.version,
          reason,
          ...(confirmation !== null ? { confirmUnlink: true } : {}),
        });
        if (!result.ok && result.error.code === "PACKAGE_HAS_LINKED_APPOINTMENTS") {
          setConfirmation(result.error.message);
          return false;
        }
        const done = handleActionResult(result, { successMessage: t("cancelledToast") });
        if (done) onDone();
        return done;
      }}
    >
      {confirmation !== null ? <Alert variant="warning">{confirmation}</Alert> : null}
    </ReasonFields>
  );
}
