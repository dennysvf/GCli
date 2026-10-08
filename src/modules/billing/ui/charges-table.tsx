"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { ChargeView } from "../application/views";
import { ChargeStatusStamp } from "./charge-status";
import { useMoney } from "./use-money";

// Fine rules, amounts right-aligned in mono (design system 5.14). The row action is a slot, so the
// patient tab and the list each add their own button.
export function ChargesTable({
  charges,
  showPatient,
  timeZone,
  emptyText,
  rowAction,
}: {
  charges: ChargeView[];
  showPatient: boolean;
  timeZone: string;
  emptyText: string;
  rowAction?: (charge: ChargeView) => ReactNode;
}) {
  const t = useTranslations("billing.ui");
  const format = useFormatters();
  const money = useMoney();
  if (charges.length === 0) return <p className="text-muted-foreground text-sm">{emptyText}</p>;
  return (
    <div className="border-y">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columnNumber")}</TableHead>
            <TableHead>{t("columnDate")}</TableHead>
            {showPatient ? <TableHead>{t("columnPatient")}</TableHead> : null}
            <TableHead>{t("columnItem")}</TableHead>
            <TableHead className="text-right">{t("net")}</TableHead>
            <TableHead className="text-right">{t("received")}</TableHead>
            <TableHead className="text-right">{t("balanceColumn")}</TableHead>
            <TableHead>{t("columnStatus")}</TableHead>
            {rowAction ? (
              <TableHead>
                <span className="sr-only">{t("columnActions")}</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {charges.map((charge) => (
            <TableRow key={charge.id}>
              <TableCell className="font-mono">
                <Link href={`/financial/charges/${charge.id}`} className="text-primary hover:underline">
                  {charge.number}
                </Link>
              </TableCell>
              <TableCell>{format.date(charge.createdAt, timeZone)}</TableCell>
              {showPatient ? <TableCell>{charge.patientName}</TableCell> : null}
              <TableCell>{charge.itemName}</TableCell>
              <TableCell className="text-right font-mono">
                {money(charge.netMinor, charge.currency)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {money(charge.paidMinor, charge.currency)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {money(charge.balanceMinor, charge.currency)}
              </TableCell>
              <TableCell>
                <ChargeStatusStamp status={charge.status} />
              </TableCell>
              {rowAction ? <TableCell className="text-right">{rowAction(charge)}</TableCell> : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
