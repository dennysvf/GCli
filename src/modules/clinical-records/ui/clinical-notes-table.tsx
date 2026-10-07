"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { NoteListItem } from "../application/queries";
import { NoteStamps } from "./notes-list";

// The Prontuário tab of the patient page (PRD F07): one row per note, each opening the record.
export function ClinicalNotesTable({
  patientId,
  items,
  total,
}: {
  patientId: string;
  items: NoteListItem[];
  total: number;
}) {
  const t = useTranslations();
  const format = useFormatters();
  if (items.length === 0) {
    return <p className="text-muted-foreground">{t("clinicalRecords.ui.tabEmpty")}</p>;
  }
  return (
    <div className="grid gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("clinicalRecords.ui.columns.date")}</TableHead>
            <TableHead>{t("clinicalRecords.ui.columns.professional")}</TableHead>
            <TableHead>{t("clinicalRecords.ui.columns.service")}</TableHead>
            <TableHead>{t("clinicalRecords.ui.columns.note")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="whitespace-nowrap">
                <Link
                  href={`/patients/${patientId}/records?note=${item.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {format.date(item.date, item.timeZone)}
                </Link>
              </TableCell>
              <TableCell>{item.professionalName}</TableCell>
              <TableCell>{item.serviceName ?? t("clinicalRecords.ui.standalone")}</TableCell>
              <TableCell className="grid gap-1 whitespace-normal">
                <NoteStamps item={item} />
                <span className="text-muted-foreground text-xs">{item.preview}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {total > items.length ? (
        <p className="text-muted-foreground text-sm">
          {t("clinicalRecords.ui.tabRecent", { shown: items.length, total })}
        </p>
      ) : null}
    </div>
  );
}
