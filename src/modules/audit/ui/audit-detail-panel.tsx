"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/components/sheet";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { PresentedChange } from "../application/present-changes";
import type { AuditEventDetail } from "../application/views";
import { useAuditLabels } from "./audit-table";

type Loaded = { id: string; detail: AuditEventDetail } | { id: string; error: true };

function ChangeRow({ change }: { change: PresentedChange }) {
  const t = useTranslations("audit");
  const label =
    change.label === change.field ? <span className="font-mono text-xs">{change.field}</span> : change.label;
  if (change.kind === "sensitive")
    return (
      <TableRow>
        <TableCell className="align-top font-semibold">{label}</TableCell>
        <TableCell colSpan={2} className="whitespace-normal">
          {t("values.sensitive", { before: change.beforeLength ?? 0, after: change.afterLength ?? 0 })}
        </TableCell>
      </TableRow>
    );
  const text =
    change.kind === "hidden"
      ? { before: t("values.hidden"), after: t("values.hidden") }
      : change.kind === "anonymized"
        ? { before: t("values.anonymized"), after: t("values.anonymized") }
        : { before: change.before ?? t("values.empty"), after: change.after ?? t("values.empty") };
  const muted = change.kind === "value" ? "" : "text-muted-foreground italic";
  return (
    <TableRow>
      <TableCell className="align-top font-semibold">{label}</TableCell>
      <TableCell className={`align-top break-words whitespace-normal ${muted}`}>{text.before}</TableCell>
      <TableCell className={`align-top break-words whitespace-normal ${muted}`}>{text.after}</TableCell>
    </TableRow>
  );
}

// The detail side panel (design system 5.7 and 5.19): who did what, when and from where, the entity
// with "Filtrar por esta entidade", the diff (Campo, Antes, Depois) and the metadata. Esc closes it and
// the view returns focus to the row.
export function AuditDetailPanel({
  eventId,
  onClose,
  onFilterByEntity,
  onCloseAutoFocus,
}: {
  eventId: string | null;
  onClose: () => void;
  onFilterByEntity: (entityType: string, entityId: string) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const t = useTranslations("audit");
  const labels = useAuditLabels();
  const format = useFormatters();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    fetch(`/api/audit/events/${encodeURIComponent(eventId)}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const detail = (await response.json()) as AuditEventDetail;
        setLoaded({ id: eventId, detail });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ id: eventId, error: true });
      });
    return () => controller.abort();
  }, [eventId, attempt]);

  const current = loaded && loaded.id === eventId ? loaded : null;
  const detail = current && "detail" in current ? current.detail : null;

  return (
    <Sheet open={eventId !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent className="overflow-y-auto" onCloseAutoFocus={onCloseAutoFocus}>
        <SheetHeader>
          <SheetTitle>{t("panel.title")}</SheetTitle>
          <SheetDescription>{t("panel.description")}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 px-6 pb-6">
          {!current ? (
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {t("panel.loading")}
            </p>
          ) : "error" in current ? (
            <Alert variant="destructive">
              <AlertDescription className="grid gap-2">
                <span>{t("panel.loadFailed")}</span>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-fit"
                  onClick={() => {
                    setLoaded(null);
                    setAttempt((value) => value + 1);
                  }}
                >
                  {t("states.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : detail ? (
            <>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{t("table.action")}</dt>
                <dd>
                  <Stamp>{labels.action(detail.action)}</Stamp>
                </dd>
                <dt className="text-muted-foreground">{t("panel.occurredAt")}</dt>
                <dd className="tabular-nums">
                  {format.date(detail.occurredAt, detail.timeZone)}{" "}
                  {format.timeWithSeconds(detail.occurredAt, detail.timeZone)}
                </dd>
                <dt className="text-muted-foreground">{t("panel.user")}</dt>
                <dd>{labels.actor(detail.actor)}</dd>
                <dt className="text-muted-foreground">{t("panel.ipAddress")}</dt>
                <dd className="font-mono">{detail.ipAddress ?? t("values.empty")}</dd>
                <dt className="text-muted-foreground">{t("panel.requestId")}</dt>
                <dd className="font-mono text-xs break-all">{detail.requestId ?? t("values.empty")}</dd>
                <dt className="text-muted-foreground">{t("panel.eventId")}</dt>
                <dd className="font-mono text-xs break-all">{detail.id}</dd>
                {detail.entityType ? (
                  <>
                    <dt className="text-muted-foreground">{t("panel.entity")}</dt>
                    <dd className="grid gap-1">
                      <span>{labels.entityType(detail.entityType)}</span>
                      {detail.entityId ? (
                        <>
                          <span className="font-mono text-xs break-all">{detail.entityId}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-fit px-0"
                            onClick={() =>
                              detail.entityType && detail.entityId
                                ? onFilterByEntity(detail.entityType, detail.entityId)
                                : undefined
                            }
                          >
                            {t("panel.filterByEntity")}
                          </Button>
                        </>
                      ) : null}
                    </dd>
                  </>
                ) : null}
              </dl>
              <section className="grid gap-2" aria-labelledby="audit-panel-changes">
                <h3 id="audit-panel-changes" className="font-semibold">
                  {t("panel.changes")}
                </h3>
                {detail.changes.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("panel.noChanges")}</p>
                ) : (
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col" className="w-1/4">
                          {t("panel.field")}
                        </TableHead>
                        <TableHead scope="col">{t("panel.before")}</TableHead>
                        <TableHead scope="col">{t("panel.after")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.changes.map((change) => (
                        <ChangeRow key={change.field} change={change} />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
              {detail.metadata.length > 0 ? (
                <section className="grid gap-2" aria-labelledby="audit-panel-metadata">
                  <h3 id="audit-panel-metadata" className="font-semibold">
                    {t("panel.metadata")}
                  </h3>
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                    {detail.metadata.map((pair) => (
                      <div key={pair.key} className="contents">
                        <dt className="text-muted-foreground font-mono text-xs">{pair.key}</dt>
                        <dd className="break-all">{pair.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
