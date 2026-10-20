"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { Textarea } from "@/shared/ui/components/textarea";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { ExportView, RequestDetail } from "../application/requests";
import { RESOLUTION_MAX } from "../domain/limits";
import { AnonymizeDialog } from "./anonymize-dialog";
import type { RequestActions } from "./request-actions";
import { OverdueStamp, RequestStatusStamp } from "./request-stamps";

// The detail of an LGPD request (design system 5.21): the request, its history, and one action block
// for its type. While an export is being built, the page refreshes itself until the worker finishes.

const REFRESH_WHILE_BUILDING_MS = 3_000;

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm">{term}</dt>
      <dd className="text-sm whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

function ExportBlock({ detail, actions }: { detail: RequestDetail; actions: RequestActions }) {
  const t = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const zone = detail.organizationTimeZone;
  const building = detail.exports.some((item) => item.status === "PROCESSING");
  const newestDownloadable = detail.exports.find((item) => item.downloadable)?.id ?? null;

  useEffect(() => {
    if (!building) return;
    const timer = setInterval(() => router.refresh(), REFRESH_WHILE_BUILDING_MS);
    return () => clearInterval(timer);
  }, [building, router]);

  function generate() {
    startTransition(async () => {
      const result = await actions.requestExport({ requestId: detail.id });
      if (handleActionResult(result)) router.refresh();
    });
  }

  function download(item: ExportView) {
    startTransition(async () => {
      const result = await actions.download({ exportId: item.id });
      if (handleActionResult(result)) window.location.assign(result.data.url);
    });
  }

  const sizeText = (bytes: number | null) =>
    bytes === null
      ? "—"
      : bytes >= 1024 * 1024
        ? t("documents.ui.sizeMb", {
            value: format.number(bytes / (1024 * 1024), { maximumFractionDigits: 1 }),
          })
        : t("documents.ui.sizeKb", { value: format.number(Math.max(1, Math.round(bytes / 1024))) });

  return (
    <section className="grid gap-3" aria-labelledby="export-title">
      <h2 id="export-title" className="section-title">
        {t("privacy.exports.title")}
      </h2>
      <p className="text-muted-foreground text-sm">{t("privacy.exports.hint")}</p>
      <p aria-live="polite" className="text-muted-foreground text-xs" data-testid="export-status">
        {building ? t("privacy.exports.generating") : ""}
      </p>
      {detail.exports.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("privacy.exports.none")}</p>
      ) : (
        <ul className="grid gap-3">
          {detail.exports.map((item) => (
            <li
              key={item.id}
              className="grid gap-1 border-b pb-3"
              data-testid="export-item"
              data-export-id={item.id}
            >
              <span className="text-xs tabular-nums">
                {t("privacy.requests.historyEvents.EXPORT_REQUESTED")} ·{" "}
                {format.dateTime(item.requestedAt, zone)} · {item.requestedByName}
              </span>
              {item.status === "PROCESSING" ? (
                <span className="text-muted-foreground text-xs">{t("privacy.exports.generating")}</span>
              ) : null}
              {item.status === "FAILED" ? (
                <span className="text-destructive text-xs">{t("privacy.exports.failed")}</span>
              ) : null}
              {item.status === "READY" && item.readyAt ? (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {t("privacy.exports.readyLine", {
                    dateTime: format.dateTime(item.readyAt, zone),
                    files: t("privacy.exports.files", { count: item.fileCount ?? 0 }),
                    size: sizeText(item.sizeBytes),
                  })}
                </span>
              ) : null}
              {item.downloadable && item.expiresAt ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant={item.id === newestDownloadable ? "default" : "outline"}
                    disabled={pending}
                    onClick={() => download(item)}
                  >
                    {t("privacy.exports.download")}
                  </Button>
                  <span className="text-muted-foreground text-xs">
                    {t("privacy.exports.availableUntil", { date: format.date(item.expiresAt, zone) })}
                  </span>
                </div>
              ) : null}
              {item.status === "EXPIRED" && (item.expiredAt ?? item.expiresAt) ? (
                <span className="text-muted-foreground text-xs">
                  {t("privacy.exports.expiredOn", {
                    date: format.date(item.expiresAt ?? item.expiredAt ?? "", zone),
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {detail.actions.export ? (
        <Button
          type="button"
          className="w-fit"
          variant={detail.actions.export === "GENERATE" ? "default" : "outline"}
          disabled={pending}
          onClick={generate}
        >
          {detail.actions.export === "GENERATE"
            ? t("privacy.exports.generate")
            : detail.actions.export === "RETRY"
              ? t("privacy.exports.retry")
              : t("privacy.exports.again")}
        </Button>
      ) : null}
    </section>
  );
}

function CompleteBlock({ detail, actions }: { detail: RequestDetail; actions: RequestActions }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await actions.complete({ requestId: detail.id, resolution });
      if (result.ok) {
        toast.success(t("privacy.requests.completed"));
        setOpen(false);
        router.refresh();
        return;
      }
      if (result.error.fields?.resolution) setError(result.error.fields.resolution);
      else toast.error(result.error.message, { duration: Infinity, closeButton: true });
    });
  }

  return (
    <>
      <Button type="button" className="w-fit" onClick={() => setOpen(true)}>
        {t("privacy.requests.complete")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("privacy.requests.completeTitle")}</DialogTitle>
            <DialogDescription>{t("privacy.requests.completeHint")}</DialogDescription>
          </DialogHeader>
          <Field id="request-resolution" label={t("privacy.requests.resolution")} error={error ?? undefined}>
            <Textarea
              id="request-resolution"
              rows={4}
              maxLength={RESOLUTION_MAX}
              value={resolution}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "request-resolution-error" : undefined}
              onChange={(event) => setResolution(event.target.value)}
            />
          </Field>
          <p className="text-muted-foreground text-xs tabular-nums">
            {t("privacy.requests.characters", { count: resolution.length, max: RESOLUTION_MAX })}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={pending} onClick={confirm}>
              {pending ? t("privacy.requests.completing") : t("privacy.requests.complete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RequestDetailView({ detail, actions }: { detail: RequestDetail; actions: RequestActions }) {
  const t = useTranslations();
  const format = useFormatters();
  const zone = detail.organizationTimeZone;

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <RequestStatusStamp status={detail.status} />
          {detail.overdue ? <OverdueStamp days={detail.daysOpen} /> : null}
        </div>
        <dl className="grid gap-2">
          <Definition term={t("privacy.requests.fields.patient")}>
            <Link href={`/patients/${detail.patient.id}`} className="underline-offset-4 hover:underline">
              {detail.patient.displayName}
            </Link>
          </Definition>
          <Definition term={t("privacy.requests.fields.type")}>
            {t(`privacy.requests.types.${detail.type}`)}
          </Definition>
          <Definition term={t("privacy.requests.fields.requestedBy")}>
            {t(`privacy.requests.requesters.${detail.requestedBy}`)}
          </Definition>
          <Definition term={t("privacy.requests.fields.description")}>{detail.description}</Definition>
          <Definition term={t("privacy.requests.fields.createdAt")}>
            {format.dateTime(detail.createdAt, zone)}
          </Definition>
          <Definition term={t("privacy.requests.fields.createdBy")}>{detail.createdByName}</Definition>
          <Definition term={t("privacy.requests.fields.status")}>
            {t(`privacy.requests.statuses.${detail.status}`)}
          </Definition>
          <Definition term={t("privacy.requests.fields.completedAt")}>
            {detail.completedAt ? format.date(detail.completedAt, zone) : "—"}
          </Definition>
          {detail.resolution ? (
            <Definition term={t("privacy.requests.fields.resolution")}>{detail.resolution}</Definition>
          ) : null}
        </dl>
      </section>

      {detail.type === "ACCESS" ? <ExportBlock detail={detail} actions={actions} /> : null}
      {detail.type === "CORRECTION" && detail.actions.complete ? (
        <CompleteBlock detail={detail} actions={actions} />
      ) : null}
      {detail.type === "ANONYMIZATION" ? (
        <section className="grid gap-3" aria-labelledby="anonymization-title">
          <h2 id="anonymization-title" className="section-title">
            {t("privacy.anonymization.title")}
          </h2>
          {detail.status === "LEGAL_RETENTION" ? (
            <Alert variant="warning">{t("privacy.anonymization.retention")}</Alert>
          ) : (
            <p className="text-muted-foreground text-sm">{t("privacy.anonymization.hint")}</p>
          )}
          {detail.actions.anonymize ? <AnonymizeDialog requestId={detail.id} actions={actions} /> : null}
        </section>
      ) : null}
      {!detail.actions.complete &&
      !detail.actions.anonymize &&
      detail.type !== "ACCESS" &&
      detail.completedAt ? (
        <p className="text-muted-foreground text-sm">{t("privacy.requests.closedNotice")}</p>
      ) : null}

      <section className="grid gap-3" aria-labelledby="history-title">
        <h2 id="history-title" className="section-title">
          {t("privacy.requests.history")}
        </h2>
        <Table className="max-w-2xl">
          <TableHeader>
            <TableRow>
              <TableHead>{t("privacy.requests.historyColumns.dateTime")}</TableHead>
              <TableHead>{t("privacy.requests.historyColumns.event")}</TableHead>
              <TableHead>{t("privacy.requests.historyColumns.by")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.history.map((line, index) => (
              <TableRow key={`${line.at}-${line.event}-${index}`}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {format.dateTime(line.at, zone)}
                </TableCell>
                <TableCell>{t(`privacy.requests.historyEvents.${line.event}`)}</TableCell>
                <TableCell>{line.byName ?? t("privacy.requests.system")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
