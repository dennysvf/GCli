"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { Button } from "@/shared/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { PendingApproval } from "../application/discounts";
import type { BillingActions } from "./billing-actions";
import { ReasonDialog } from "./reason-dialog";
import { useMoney } from "./use-money";

// Financeiro > Aprovações (PRD F09 Experience): pending discounts with approve and reject.
export function ApprovalsTable({
  initial,
  timeZone,
  actions,
}: {
  initial: PendingApproval[];
  timeZone: string;
  actions: Pick<BillingActions, "pending" | "approve" | "reject">;
}) {
  const t = useTranslations("billing.ui");
  const money = useMoney();
  const format = useFormatters();
  const [items, setItems] = useState(initial);
  const [rejecting, setRejecting] = useState<PendingApproval | null>(null);

  const reload = useCallback(async () => {
    const result = await actions.pending({});
    if (handleActionResult(result)) setItems(result.data);
  }, [actions]);

  async function approve(item: PendingApproval) {
    const result = await actions.approve({ chargeId: item.charge.id, version: item.charge.version });
    if (handleActionResult(result, { successMessage: t("discountApprovedToast") })) await reload();
  }

  if (items.length === 0) return <p className="text-muted-foreground">{t("noApprovals")}</p>;
  return (
    <>
      <div className="border-y">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columnNumber")}</TableHead>
              <TableHead>{t("columnPatient")}</TableHead>
              <TableHead className="text-right">{t("gross")}</TableHead>
              <TableHead className="text-right">{t("requestedDiscount")}</TableHead>
              <TableHead>{t("discountReason")}</TableHead>
              <TableHead>{t("requestedBy")}</TableHead>
              <TableHead>{t("columnDate")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("columnActions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.charge.id}>
                <TableCell className="font-mono">
                  <Link
                    href={`/financial/charges/${item.charge.id}`}
                    className="text-primary hover:underline"
                  >
                    {item.charge.number}
                  </Link>
                </TableCell>
                <TableCell>{item.charge.patientName}</TableCell>
                <TableCell className="text-right font-mono">
                  {money(item.charge.grossMinor, item.charge.currency)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {money(item.request.discountMinor, item.charge.currency)}
                  <span className="text-muted-foreground font-sans">
                    {" "}
                    (
                    {format.number((item.request.discountMinor / item.charge.grossMinor) * 100, {
                      maximumFractionDigits: 2,
                    })}
                    %)
                  </span>
                </TableCell>
                <TableCell>{item.request.reason}</TableCell>
                <TableCell>{item.request.requestedByName}</TableCell>
                <TableCell>{format.dateTime(item.request.requestedAt, timeZone)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" onClick={() => void approve(item)}>
                      {t("approve")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(item)}>
                      {t("reject")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rejecting ? (
        <ReasonDialog
          title={t("rejectTitle")}
          description={t("rejectHint")}
          confirmLabel={t("reject")}
          onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            const result = await actions.reject({
              chargeId: rejecting.charge.id,
              version: rejecting.charge.version,
              reason,
            });
            const done = handleActionResult(result, { successMessage: t("discountRejectedToast") });
            if (done) await reload();
            return done;
          }}
        />
      ) : null}
    </>
  );
}
