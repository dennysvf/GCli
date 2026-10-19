"use client";

import { CalendarDays, ClipboardCheck, FileText, Stethoscope, Wallet, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { isCurrency } from "@/shared/kernel/countries/codes";
import { Button } from "@/shared/ui/components/button";
import { Stamp, type StampVariant } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { TimelineItem } from "../application/ports";
import type { TimelineGroup } from "../domain/timeline-event";
import type { TimelineActions } from "./timeline-actions";
import { TimelineNoteView } from "./timeline-note";

// One event of the timeline (design system 5.20): the group icon beside the title, the date and time,
// the summary, "por {name}" and a stamp for each state. Clinical items never show note text until
// "Ver registro" opens them (an audited read).

const ICONS: Record<TimelineGroup, LucideIcon> = {
  REGISTRATION: ClipboardCheck,
  APPOINTMENTS: CalendarDays,
  CLINICAL: Stethoscope,
  DOCUMENTS: FileText,
  FINANCIAL: Wallet,
};

// The tones of design system 5.5 for appointments and 5.14 for charges.
const APPOINTMENT_TONES: Record<string, StampVariant> = {
  SCHEDULED: "neutral",
  CONFIRMED: "success",
  CHECKED_IN: "info",
  IN_PROGRESS: "info",
  COMPLETED: "strong",
  NO_SHOW: "danger",
  CANCELLED: "cancelled",
};
const CHARGE_TONES: Record<string, StampVariant> = {
  PENDING_APPROVAL: "warning",
  OPEN: "neutral",
  PARTIALLY_PAID: "info",
  PAID: "success",
  CANCELLED: "cancelled",
};

function useMoney() {
  const format = useFormatters();
  return (amountMinor: string, currency: string, absolute = false) => {
    const value = BigInt(amountMinor);
    const amount = absolute && value < BigInt(0) ? -value : value;
    return isCurrency(currency) ? format.money({ amountMinor: amount, currency }) : `${currency} ${amount}`;
  };
}

export function TimelineEvent({
  item,
  patientId,
  openNote,
}: {
  item: TimelineItem;
  patientId: string;
  openNote: TimelineActions["openNote"];
}) {
  const t = useTranslations();
  const format = useFormatters();
  const money = useMoney();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const Icon = ICONS[item.group];

  const title =
    item.kind === "CHARGE_CREATED"
      ? t("privacy.events.CHARGE_CREATED", { number: item.number })
      : t(`privacy.events.${item.kind}`);

  let summary: string | null = null;
  const stamps: { key: string; variant: StampVariant; text: string }[] = [];
  let disclosure: "history" | "note" | null = null;
  let noteId: string | null = null;

  switch (item.kind) {
    case "CONSENT_RECORDED":
      summary = t("privacy.ui.consentSummary", {
        version: item.termsVersion,
        method: t(`patients.ui.consentMethods.${item.method}`),
      });
      break;
    case "APPOINTMENT":
      summary = item.roomName
        ? t("privacy.ui.appointmentSummaryRoom", {
            service: item.serviceName,
            professional: item.professionalName,
            unit: item.unitName,
            room: item.roomName,
          })
        : t("privacy.ui.appointmentSummary", {
            service: item.serviceName,
            professional: item.professionalName,
            unit: item.unitName,
          });
      stamps.push({
        key: "status",
        variant: APPOINTMENT_TONES[item.status] ?? "neutral",
        text: t(`scheduling.ui.status.${item.status}`),
      });
      if (item.isOverbooking)
        stamps.push({ key: "overbooking", variant: "warning", text: t("privacy.ui.overbooking") });
      disclosure = "history";
      break;
    case "CLINICAL_NOTE_FINALIZED":
      summary = item.serviceName
        ? t("privacy.ui.noteSummary", { professional: item.professionalName, service: item.serviceName })
        : t("privacy.ui.noteSummaryStandalone", { professional: item.professionalName });
      if (item.autoFinalized)
        stamps.push({ key: "auto", variant: "neutral", text: t("privacy.ui.autoFinalized") });
      disclosure = "note";
      noteId = item.noteId;
      break;
    case "CLINICAL_ADDENDUM_ADDED":
      summary = t("privacy.ui.addendumSummary", { professional: item.professionalName });
      disclosure = "note";
      noteId = item.noteId;
      break;
    case "DOCUMENT_UPLOADED":
    case "DOCUMENT_GENERATED":
      summary = t("privacy.ui.documentSummary", {
        title: item.erased ? t("privacy.ui.erasedDocument") : item.title,
        category: item.categoryName,
      });
      if (item.clinical) stamps.push({ key: "clinical", variant: "info", text: t("privacy.ui.clinical") });
      if (item.erased) stamps.push({ key: "erased", variant: "neutral", text: t("privacy.ui.erased") });
      else if (item.archived)
        stamps.push({ key: "archived", variant: "neutral", text: t("privacy.ui.archived") });
      break;
    case "CHARGE_CREATED":
      summary = t("privacy.ui.chargeSummary", {
        item: item.itemName ?? "—",
        amount: money(item.netMinor, item.currency),
      });
      stamps.push({
        key: "status",
        variant: CHARGE_TONES[item.status] ?? "neutral",
        text: t(`billing.status.${item.status}`),
      });
      break;
    case "PAYMENT_RECEIVED":
    case "PAYMENT_REFUNDED":
      summary = t("privacy.ui.paymentSummary", {
        number: item.chargeNumber,
        method: t(`countries.paymentMethods.${item.method}`),
        amount: money(item.amountMinor, item.currency, true),
      });
      break;
    case "PATIENT_REGISTERED":
      break;
  }

  const showLabel = disclosure === "history" ? t("privacy.ui.showHistory") : t("privacy.ui.showNote");
  const hideLabel = disclosure === "history" ? t("privacy.ui.hideHistory") : t("privacy.ui.hideNote");

  return (
    <li className="relative grid gap-1 pb-5 pl-8" data-testid="timeline-event" data-key={item.key}>
      <span className="bg-background text-muted-foreground absolute top-0.5 left-0 flex size-5 items-center justify-center">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-semibold">{title}</h3>
        <time dateTime={item.occurredAt} className="text-muted-foreground text-xs tabular-nums">
          {format.dateTime(item.occurredAt, item.timeZone)}
        </time>
      </div>
      {summary ? <p className="text-sm">{summary}</p> : null}
      {stamps.length > 0 || (item.kind === "APPOINTMENT" && item.rescheduleCount > 0) ? (
        <div className="flex flex-wrap items-center gap-1">
          {stamps.map((stamp) => (
            <Stamp key={stamp.key} variant={stamp.variant}>
              {stamp.text}
            </Stamp>
          ))}
          {item.kind === "APPOINTMENT" && item.rescheduleCount > 0 ? (
            <span className="text-muted-foreground text-xs">
              {t("privacy.ui.rescheduled", { count: item.rescheduleCount })}
            </span>
          ) : null}
        </div>
      ) : null}
      {item.authorName ? (
        <p className="text-muted-foreground text-xs">{t("privacy.ui.by", { name: item.authorName })}</p>
      ) : null}
      {disclosure ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? hideLabel : showLabel}
          </Button>
        </div>
      ) : null}
      {open ? (
        <div id={panelId} className="pt-2">
          {item.kind === "APPOINTMENT" ? (
            item.history.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("privacy.ui.historyEmpty")}</p>
            ) : (
              <Table className="max-w-xl">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("privacy.ui.historyStatus")}</TableHead>
                    <TableHead>{t("privacy.ui.historyDateTime")}</TableHead>
                    <TableHead>{t("privacy.ui.historyBy")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {item.history.map((line, index) => (
                    <TableRow key={`${line.changedAt}-${index}`}>
                      <TableCell>
                        <Stamp variant={APPOINTMENT_TONES[line.toStatus] ?? "neutral"}>
                          {t(`scheduling.ui.status.${line.toStatus}`)}
                        </Stamp>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {format.dateTime(line.changedAt, item.timeZone)}
                      </TableCell>
                      <TableCell>{line.changedByName ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : noteId ? (
            <TimelineNoteView patientId={patientId} noteId={noteId} openNote={openNote} />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
