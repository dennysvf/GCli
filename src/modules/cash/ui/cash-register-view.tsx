"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Currency } from "@/shared/kernel/countries/codes";
import { Alert } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { CategoryRecord } from "../application/ports";
import type { DayLine, RegisterDay } from "../application/views";
import type { CashActions } from "./cash-actions";
import { openInNewTab } from "./open-link";
import {
  CloseDialog,
  MovementDialog,
  OpenRegisterForm,
  ReopenDialog,
  ReverseDialog,
} from "./register-dialogs";

const DIALOG = { movement: "movement", reverse: "reverse", close: "close", reopen: "reopen" } as const;

type Dialog =
  | { kind: typeof DIALOG.movement }
  | { kind: "reverse"; movementId: string }
  | { kind: typeof DIALOG.close }
  | { kind: typeof DIALOG.reopen };

// Financeiro > Caixa (PRD F11): the day of the selected unit. Payments are read from billing and
// shown read-only; the manual movements are reversed, never edited.
export function CashRegisterView({
  day,
  categories,
  canReopen,
  actions,
}: {
  day: RegisterDay;
  categories: CategoryRecord[];
  canReopen: boolean;
  actions: CashActions;
}) {
  const t = useTranslations("cash.ui");
  const tc = useTranslations();
  const router = useRouter();
  const format = useFormatters();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const money = (minor: number) => format.money({ amountMinor: minor, currency: day.currency as Currency });
  const register = day.register;
  const refresh = () => router.refresh();
  const timeZone = day.unit.timeZone;

  const status = !register
    ? null
    : register.status === "CLOSED"
      ? "CLOSED"
      : register.flaggedUnclosed
        ? "UNCLOSED"
        : "OPEN";

  function describe(line: DayLine) {
    if (line.source === "MOVEMENT") {
      return (
        <div className="grid">
          <span>{line.description}</span>
          <span className="text-muted-foreground text-xs">
            {line.categoryName}
            {line.createdByName ? ` · ${line.createdByName}` : ""}
          </span>
          {line.reversed && line.reversalReason ? (
            <span className="text-muted-foreground text-xs">
              {t("reversedBecause", { reason: line.reversalReason })}
            </span>
          ) : null}
        </div>
      );
    }
    return (
      <div className="grid">
        <Link href={`/financial/charges/${line.chargeId}`} className="text-primary hover:underline">
          {t("chargeNumber", { number: line.chargeNumber ?? "" })}
        </Link>
        {line.patientName ? <span className="text-muted-foreground text-xs">{line.patientName}</span> : null}
      </div>
    );
  }

  const sourceLabel = (line: DayLine) =>
    line.source === "PAYMENT"
      ? t("sourcePayment")
      : line.source === "REFUND"
        ? t("sourceRefund")
        : t("sourceMovement");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs">{t("unit")}</span>
            <span className="font-semibold">{day.unit.name}</span>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="cash-date">{t("date")}</Label>
            <Input
              id="cash-date"
              type="date"
              value={day.businessDate}
              max={day.today}
              onChange={(event) =>
                event.target.value && router.push(`/financial/cash?date=${event.target.value}`)
              }
            />
          </div>
          {status ? (
            <Stamp variant={status === "OPEN" ? "success" : status === "UNCLOSED" ? "warning" : "neutral"}>
              {status === "OPEN"
                ? t("statusOpen")
                : status === "CLOSED"
                  ? t("statusClosed")
                  : t("statusUnclosed")}
            </Stamp>
          ) : null}
        </div>
        {register ? (
          <div className="flex flex-wrap gap-2">
            {register.status === "OPEN" ? (
              <>
                <Button type="button" variant="outline" onClick={() => setDialog({ kind: DIALOG.movement })}>
                  {t("newMovement")}
                </Button>
                <Button type="button" onClick={() => setDialog({ kind: DIALOG.close })}>
                  {t("closeRegister")}
                </Button>
              </>
            ) : canReopen ? (
              <Button type="button" variant="outline" onClick={() => setDialog({ kind: DIALOG.reopen })}>
                {t("reopenRegister")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {day.pendingUnclosed.map((pending) => (
        <Alert key={pending.registerId} variant="warning">
          {t("unclosedBanner", { date: format.shortDate(pending.businessDate) })}{" "}
          <Link href={`/financial/cash?date=${pending.businessDate}`} className="underline">
            {t("goToRegister")}
          </Link>
        </Alert>
      ))}

      {!register ? (
        <OpenRegisterForm
          unitId={day.unit.id}
          businessDate={day.businessDate}
          currency={day.currency}
          suggestedOpeningMinor={day.suggestedOpeningMinor}
          actions={actions}
          onOpened={refresh}
        />
      ) : null}

      <section className="grid gap-2" aria-label={t("summary")}>
        <h2 className="section-title">{t("summary")}</h2>
        {day.byMethod.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noPayments")}</p>
        ) : (
          <div className="border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("method")}</TableHead>
                  <TableHead className="text-right">{t("received")}</TableHead>
                  <TableHead className="text-right">{t("refunded")}</TableHead>
                  <TableHead className="text-right">{t("net")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {day.byMethod.map((row) => (
                  <TableRow key={row.method}>
                    <TableCell className="font-semibold">
                      {tc(`countries.paymentMethods.${row.method}`)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{money(row.receivedMinor)}</TableCell>
                    <TableCell className="text-right font-mono">{money(row.refundedMinor)}</TableCell>
                    <TableCell className="text-right font-mono">{money(row.netMinor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {register && day.expectedMinor !== null ? (
          <dl className="grid max-w-sm grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("openingBalance")}</dt>
            <dd className="text-right font-mono">{money(register.openingMinor)}</dd>
            <dt className="font-semibold">{t("expectedCash")}</dt>
            <dd className="text-right font-mono font-semibold">{money(day.expectedMinor)}</dd>
          </dl>
        ) : null}
      </section>

      {day.lines.length > 0 ? (
        <section className="grid gap-2" aria-label={t("movements")}>
          <h2 className="section-title">{t("movements")}</h2>
          <div className="border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("time")}</TableHead>
                  <TableHead>{t("source")}</TableHead>
                  <TableHead>{t("detail")}</TableHead>
                  <TableHead>{t("method")}</TableHead>
                  <TableHead className="text-right">{t("amount")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {day.lines.map((line) => (
                  <TableRow
                    key={`${line.source}-${line.id}`}
                    className={line.reversed ? "line-through" : undefined}
                  >
                    <TableCell className="font-mono">{format.time(line.at, timeZone)}</TableCell>
                    <TableCell>
                      {sourceLabel(line)}
                      {line.reversed ? (
                        <>
                          {" "}
                          <Stamp variant="cancelled">{t("reversedStamp")}</Stamp>
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell>{describe(line)}</TableCell>
                    <TableCell>{line.method ? tc(`countries.paymentMethods.${line.method}`) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{money(line.amountMinor)}</TableCell>
                    <TableCell className="text-right">
                      {line.source === "MOVEMENT" && !line.reversed && register?.status === "OPEN" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setDialog({ kind: DIALOG.reverse, movementId: line.id })}
                        >
                          {t("reverse")}
                        </Button>
                      ) : null}
                      {line.attachmentId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const link = await actions.downloadUrl({ attachmentId: line.attachmentId ?? "" });
                            if (link.ok) openInNewTab(link.data.url);
                          }}
                        >
                          {t("receipt")}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {day.history.length > 0 ? (
        <section className="grid gap-2" aria-label={t("history")}>
          <h2 className="section-title">{t("history")}</h2>
          <ul className="grid gap-2 text-sm">
            {day.history.map((item) => (
              <li key={`${item.kind}-${item.at}`} className="grid gap-0.5 border-b pb-2">
                <span className="font-semibold">
                  {item.kind === "CLOSING"
                    ? t("historyClosing", { sequence: item.sequence })
                    : t("historyReopening")}
                  <span className="text-muted-foreground font-normal">
                    {" · "}
                    {format.dateTime(item.at, timeZone)}
                    {item.byName ? ` · ${item.byName}` : ""}
                  </span>
                  {item.kind === "CLOSING" && item.wasFlaggedUnclosed ? (
                    <>
                      {" "}
                      <Stamp variant="warning">{t("statusUnclosed")}</Stamp>
                    </>
                  ) : null}
                </span>
                {item.kind === "CLOSING" ? (
                  <span className="text-muted-foreground">
                    {t("historyFigures", {
                      expected: money(item.expectedMinor),
                      counted: money(item.countedMinor),
                      difference: money(item.differenceMinor),
                    })}
                    {item.justification ? ` · ${item.justification}` : ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{item.reason}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dialog?.kind === "movement" && register ? (
        <MovementDialog
          registerId={register.id}
          currency={day.currency}
          categories={categories}
          actions={actions}
          onDone={refresh}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "reverse" ? (
        <ReverseDialog
          movementId={dialog.movementId}
          actions={actions}
          onDone={refresh}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "close" && register && day.expectedMinor !== null ? (
        <CloseDialog
          registerId={register.id}
          currency={day.currency}
          expectedMinor={day.expectedMinor}
          actions={actions}
          onDone={refresh}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "reopen" && register ? (
        <ReopenDialog
          registerId={register.id}
          actions={actions}
          onDone={refresh}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
