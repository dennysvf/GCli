import Link from "next/link";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import type { AgendaItem } from "../application/queries";
import { STATUS_STAMPS, useAgendaFormat } from "./format";
import { useTranslations } from "next-intl";

// List view (PRD F06: table with pagination of 50) and the patient's Agendamentos tab. The first
// column opens the appointment (design system 5.4).
export function AppointmentsTable({
  items,
  hrefOf,
  showPatient = true,
  emptyText,
}: {
  items: AgendaItem[];
  hrefOf: (item: AgendaItem) => string;
  showPatient?: boolean;
  emptyText: string;
}) {
  const fmt = useAgendaFormat();
  const t = useTranslations();
  if (items.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;
  return (
    <div className="border-y">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("scheduling.ui.dateTime")}</TableHead>
            {showPatient ? <TableHead>{t("common.patient")}</TableHead> : null}
            <TableHead className="hidden md:table-cell">{t("common.service")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("common.professional")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("common.room")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("common.unit")}</TableHead>
            <TableHead className="w-36">{t("common.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="tabular-nums">
                <Link
                  href={hrefOf(item)}
                  scroll={false}
                  className="text-primary font-semibold hover:underline"
                >
                  {fmt.dateTimeOf(item.startsAt, item.unitTimeZone)}
                </Link>
              </TableCell>
              {showPatient ? (
                <TableCell className="font-semibold">{item.patient.displayName}</TableCell>
              ) : null}
              <TableCell className="hidden md:table-cell">{item.service.name}</TableCell>
              <TableCell className="hidden md:table-cell">{item.professional.displayName}</TableCell>
              <TableCell className="hidden lg:table-cell">{item.room?.name ?? "—"}</TableCell>
              <TableCell className="hidden lg:table-cell">{item.unitName}</TableCell>
              <TableCell>
                <span className="flex flex-wrap gap-1">
                  <Stamp variant={STATUS_STAMPS[item.status]}>{fmt.statusText(item.status)}</Stamp>
                  {item.isOverbooking ? (
                    <Stamp variant="warning">{t("scheduling.ui.overbookingTag")}</Stamp>
                  ) : null}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
