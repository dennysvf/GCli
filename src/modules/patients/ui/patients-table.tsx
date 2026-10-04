import Link from "next/link";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { cn } from "@/shared/ui/utils";
import type { PatientSearchItem } from "../application/search";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import { useTranslations } from "next-intl";

// Search results (PRD F05): name, age, CPF (masked for Front Desk), phone and last appointment.
export function PatientsTable({ items }: { items: PatientSearchItem[] }) {
  const t = useTranslations();
  const format = useFormatters();
  return (
    <div className="border-y">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common.name")}</TableHead>
            <TableHead className="w-20 text-right">{t("patients.ui.age")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("patients.ui.document")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("patients.ui.mobile")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("patients.ui.lastAppointment")}</TableHead>
            <TableHead className="w-24">{t("common.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className={cn(!item.active && "text-muted-foreground")}>
              <TableCell>
                <div className="grid">
                  <Link
                    href={`/patients/${item.id}`}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {item.displayName}
                  </Link>
                  <span className="text-muted-foreground text-xs tabular-nums md:hidden">
                    {item.document?.display ?? t("patients.ui.documentNotInformed")} · {item.mobilePhone}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{item.age}</TableCell>
              <TableCell className="hidden tabular-nums md:table-cell">
                {item.document?.display ?? "—"}
              </TableCell>
              <TableCell className="hidden tabular-nums md:table-cell">{item.mobilePhone}</TableCell>
              <TableCell className="hidden tabular-nums lg:table-cell">
                {item.lastAppointmentAt ? format.date(item.lastAppointmentAt.slice(0, 10)) : "—"}
              </TableCell>
              <TableCell>
                <Stamp variant={item.active ? "success" : "neutral"}>
                  {item.active ? t("common.active") : t("common.inactive")}
                </Stamp>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
