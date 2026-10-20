"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Alert } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { RequestList } from "../application/requests";
import { REQUEST_STATUSES, REQUEST_TYPES } from "../domain/lgpd-request";
import { NewRequestPanel } from "./new-request-panel";
import type { RequestActions } from "./request-actions";
import { OverdueStamp, RequestStatusStamp } from "./request-stamps";

// "LGPD > Solicitações" (PRD F14 Experience, design system 5.21): the register as a table, with the
// status and type filters in the URL so the page stays a Server Component.
export function RequestsView({
  list,
  filters,
  actions,
}: {
  list: RequestList;
  filters: { status: string; type: string };
  actions: RequestActions;
}) {
  const t = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in changes)) next.delete("page");
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  const filtered = filters.status !== "OPEN" || filters.type !== "ALL";

  return (
    <div className="grid gap-4" aria-busy={pending}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="requests-status">{t("privacy.requests.filters.status")}</Label>
            <Select
              value={filters.status}
              onValueChange={(value) => apply({ status: value === "OPEN" ? null : value })}
            >
              <SelectTrigger id="requests-status" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">{t("privacy.requests.filters.open")}</SelectItem>
                <SelectItem value="ALL">{t("privacy.requests.filters.all")}</SelectItem>
                {REQUEST_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(`privacy.requests.statuses.${status}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="requests-type">{t("privacy.requests.filters.type")}</Label>
            <Select
              value={filters.type}
              onValueChange={(value) => apply({ type: value === "ALL" ? null : value })}
            >
              <SelectTrigger id="requests-type" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("privacy.requests.filters.allTypes")}</SelectItem>
                {REQUEST_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`privacy.requests.types.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <NewRequestPanel actions={actions} />
      </div>

      {list.openOverdueCount > 0 ? (
        <Alert variant="warning">
          {t("privacy.requests.overdueSummary", { count: list.openOverdueCount })}
        </Alert>
      ) : null}

      {list.items.length === 0 ? (
        <p className="text-muted-foreground">
          {filtered ? t("privacy.requests.empty") : t("privacy.requests.emptyAll")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("privacy.requests.columns.date")}</TableHead>
              <TableHead>{t("privacy.requests.columns.patient")}</TableHead>
              <TableHead>{t("privacy.requests.columns.type")}</TableHead>
              <TableHead>{t("privacy.requests.columns.requestedBy")}</TableHead>
              <TableHead>{t("privacy.requests.columns.status")}</TableHead>
              <TableHead>{t("privacy.requests.columns.completedAt")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.items.map((item) => (
              <TableRow key={item.id} data-testid="request-row" data-request-id={item.id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {format.date(item.createdAt, list.organizationTimeZone)}
                </TableCell>
                <TableCell className="font-semibold">
                  <Link href={`/lgpd/requests/${item.id}`} className="underline-offset-4 hover:underline">
                    {item.patientDisplayName}
                  </Link>
                </TableCell>
                <TableCell>{t(`privacy.requests.types.${item.type}`)}</TableCell>
                <TableCell>{t(`privacy.requests.requesters.${item.requestedBy}`)}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    <RequestStatusStamp status={item.status} />
                    {item.overdue ? <OverdueStamp days={item.daysOpen} /> : null}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {item.completedAt ? format.date(item.completedAt, list.organizationTimeZone) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pages > 1 ? (
        <nav aria-label={t("common.pagination")} className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={list.page <= 1}
            onClick={() => apply({ page: String(list.page - 1) })}
          >
            {t("common.previous")}
          </Button>
          <span className="text-muted-foreground text-sm">
            {t("privacy.requests.pageOf", { page: list.page, pages })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={list.page >= pages}
            onClick={() => apply({ page: String(list.page + 1) })}
          >
            {t("common.next")}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
