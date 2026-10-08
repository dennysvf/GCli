"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/components/button";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { DocumentItem } from "../application/documents";

// The documents of a patient (PRD F08 Experience): date, title, category, author and size. State is
// written as text in stamps, never by color alone, and the row actions are the ones the server said
// this user may use.
export function DocumentsTable({
  items,
  timeZone,
  onPreview,
  onEdit,
  onArchive,
  onRestore,
}: {
  items: DocumentItem[];
  timeZone: string;
  onPreview: (item: DocumentItem) => void;
  onEdit: (item: DocumentItem) => void;
  onArchive: (item: DocumentItem) => void;
  onRestore: (item: DocumentItem) => void;
}) {
  const t = useTranslations("documents");
  const format = useFormatters();

  const sizeText = (bytes: number) =>
    bytes >= 1024 * 1024
      ? t("ui.sizeMb", { value: format.number(bytes / (1024 * 1024), { maximumFractionDigits: 1 }) })
      : t("ui.sizeKb", { value: format.number(Math.max(1, Math.round(bytes / 1024))) });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("ui.columns.date")}</TableHead>
          <TableHead>{t("ui.columns.title")}</TableHead>
          <TableHead>{t("ui.columns.category")}</TableHead>
          <TableHead>{t("ui.columns.author")}</TableHead>
          <TableHead className="text-right">{t("ui.columns.size")}</TableHead>
          <TableHead>
            <span className="sr-only">{t("ui.columns.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="whitespace-nowrap tabular-nums">
              {format.date(item.createdAt, timeZone)}
            </TableCell>
            <TableCell className="grid gap-1 whitespace-normal">
              <span className="font-medium">{item.title}</span>
              <span className="flex flex-wrap gap-1">
                {item.clinical ? <Stamp variant="info">{t("ui.stampClinical")}</Stamp> : null}
                {item.kind === "GENERATED" ? <Stamp variant="neutral">{t("ui.stampIssued")}</Stamp> : null}
                {item.archived ? <Stamp variant="neutral">{t("ui.stampArchived")}</Stamp> : null}
                {item.status === "PROCESSING" ? (
                  <Stamp variant="warning">{t("ui.stampProcessing")}</Stamp>
                ) : null}
                {item.status === "FAILED" ? <Stamp variant="danger">{t("ui.stampFailed")}</Stamp> : null}
              </span>
              {item.archived ? (
                <span className="text-muted-foreground text-xs">
                  {t("ui.archivedBy", {
                    name: item.archived.byName,
                    date: format.date(item.archived.at, timeZone),
                    reason: item.archived.reason,
                  })}
                </span>
              ) : null}
            </TableCell>
            <TableCell>{item.categoryName}</TableCell>
            <TableCell>{item.authorName}</TableCell>
            <TableCell className="text-right whitespace-nowrap tabular-nums">
              {sizeText(item.sizeBytes)}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <span className="flex flex-wrap justify-end gap-1">
                {item.previewable ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onPreview(item)}>
                    {t("ui.view")}
                  </Button>
                ) : null}
                <Button asChild variant="ghost" size="sm">
                  <a href={`/api/documents/${item.id}?disposition=attachment`}>{t("ui.download")}</a>
                </Button>
                {item.canEdit && !item.archived ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(item)}>
                    {t("ui.edit")}
                  </Button>
                ) : null}
                {item.canArchive ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onArchive(item)}>
                    {t("ui.archive")}
                  </Button>
                ) : null}
                {item.canRestore ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onRestore(item)}>
                    {t("ui.restore")}
                  </Button>
                ) : null}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
