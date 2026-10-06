"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/components/button";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import { cn } from "@/shared/ui/utils";
import type { NoteListItem } from "../application/queries";

// State of a note written as text in stamps, never by color alone (design system 5.12).
export function NoteStamps({ item }: { item: NoteListItem }) {
  const t = useTranslations();
  return (
    <span className="flex flex-wrap gap-1">
      {item.state === "DRAFT" || item.isOwnDraft ? (
        <Stamp variant="warning">{t("clinicalRecords.ui.draft")}</Stamp>
      ) : null}
      {item.state === "LOCKED" ? <Stamp variant="neutral">{t("clinicalRecords.ui.locked")}</Stamp> : null}
      {item.addendaCount > 0 ? (
        <Stamp variant="info">{t("clinicalRecords.ui.addendaCount", { count: item.addendaCount })}</Stamp>
      ) : null}
    </span>
  );
}

// The list of previous notes (PRD F07 Experience): date, professional, service and the first 150
// characters. Selecting a row opens the note on the right.
export function NotesList({
  items,
  total,
  selectedId,
  canAddStandalone,
  loading,
  onSelect,
  onLoadMore,
  onNewStandalone,
}: {
  items: NoteListItem[];
  total: number;
  selectedId: string | null;
  canAddStandalone: boolean;
  loading: boolean;
  onSelect: (noteId: string) => void;
  onLoadMore: () => void;
  onNewStandalone: () => void;
}) {
  const t = useTranslations();
  const format = useFormatters();
  return (
    <section aria-labelledby="notes-list-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="notes-list-title" className="section-title">
          {t("clinicalRecords.ui.previousNotes")}
        </h3>
        {canAddStandalone ? (
          <Button type="button" variant="outline" size="sm" onClick={onNewStandalone}>
            {t("clinicalRecords.ui.newStandalone")}
          </Button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("clinicalRecords.ui.noNotes")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("clinicalRecords.ui.columns.date")}</TableHead>
              <TableHead>{t("clinicalRecords.ui.columns.note")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} data-state={item.id === selectedId ? "selected" : undefined}>
                <TableCell className="align-top whitespace-nowrap">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-current={item.id === selectedId ? "true" : undefined}
                    className={cn(
                      "h-auto px-1 py-0.5",
                      item.id === selectedId && "border-ink-blue border-l-2",
                    )}
                    onClick={() => onSelect(item.id)}
                  >
                    {format.date(item.date, item.timeZone)}
                  </Button>
                </TableCell>
                <TableCell className="grid gap-1 align-top whitespace-normal">
                  <span className="font-medium">
                    {item.serviceName
                      ? t("clinicalRecords.ui.serviceBy", {
                          service: item.serviceName,
                          professional: item.professionalName,
                        })
                      : t("clinicalRecords.ui.standaloneBy", { professional: item.professionalName })}
                  </span>
                  <NoteStamps item={item} />
                  <span className="text-muted-foreground text-xs">{item.preview}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {items.length < total ? (
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onLoadMore}>
          {t("clinicalRecords.ui.loadMore")}
        </Button>
      ) : null}
    </section>
  );
}
