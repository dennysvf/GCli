"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { ChargeList } from "../application/queries";
import { CHARGE_STATUSES } from "../domain/status";
import type { BillingActions } from "./billing-actions";
import { ChargesTable } from "./charges-table";
import { NewChargeDialog } from "./new-charge-dialog";
import { ReceiveDialog } from "./receive-dialog";
import { useMoney } from "./use-money";

const ALL = "all";

type Filters = {
  from: string;
  to: string;
  unitId: string;
  status: string;
  professionalId: string;
  method: string;
};
type ListActions = Pick<
  BillingActions,
  "listCharges" | "receiveOptions" | "receive" | "setDiscount" | "createCharge" | "newChargeOptions"
>;

// Financeiro > Cobranças (PRD F09 Experience): the list with filters (period, unit, status,
// professional, payment method) and the totals at the bottom, one line per currency.
export function ChargesList({
  initial,
  initialFilters,
  units,
  professionals,
  methods,
  timeZone,
  actions,
}: {
  initial: ChargeList;
  initialFilters: { from: string; to: string };
  units: { id: string; name: string }[];
  professionals: { id: string; name: string }[];
  methods: string[];
  timeZone: string;
  actions: ListActions;
}) {
  const t = useTranslations("billing.ui");
  const tc = useTranslations();
  const money = useMoney();
  const [filters, setFilters] = useState<Filters>({
    ...initialFilters,
    unitId: ALL,
    status: ALL,
    professionalId: ALL,
    method: ALL,
  });
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const query = useCallback(
    (next: Filters, cursor?: string) =>
      actions.listCharges({
        from: next.from,
        to: next.to,
        ...(next.unitId !== ALL ? { unitId: next.unitId } : {}),
        ...(next.status !== ALL ? { statuses: [next.status] } : {}),
        ...(next.professionalId !== ALL ? { professionalId: next.professionalId } : {}),
        ...(next.method !== ALL ? { method: next.method } : {}),
        ...(cursor ? { cursor } : {}),
      }),
    [actions],
  );

  const reload = useCallback(
    async (next: Filters) => {
      setLoading(true);
      try {
        const result = await query(next);
        if (handleActionResult(result)) setData(result.data);
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  function change(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    if (next.from && next.to && next.to >= next.from) void reload(next);
  }

  async function loadMore() {
    if (!data.nextCursor) return;
    setLoading(true);
    try {
      const result = await query(filters, data.nextCursor);
      if (handleActionResult(result)) {
        setData((current) => ({
          items: [...current.items, ...result.data.items],
          nextCursor: result.data.nextCursor,
          totals: result.data.totals,
        }));
      }
    } finally {
      setLoading(false);
    }
  }

  const receivable = (status: string) => status === "OPEN" || status === "PARTIALLY_PAID";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="filter-from">{t("filterFrom")}</Label>
            <Input
              id="filter-from"
              type="date"
              value={filters.from}
              onChange={(event) => change({ from: event.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="filter-to">{t("filterTo")}</Label>
            <Input
              id="filter-to"
              type="date"
              value={filters.to}
              onChange={(event) => change({ to: event.target.value })}
            />
          </div>
          <FilterSelect
            id="filter-unit"
            label={t("filterUnit")}
            value={filters.unitId}
            allLabel={t("all")}
            options={units.map((unit) => ({ value: unit.id, label: unit.name }))}
            onChange={(value) => change({ unitId: value })}
          />
          <FilterSelect
            id="filter-status"
            label={t("filterStatus")}
            value={filters.status}
            allLabel={t("all")}
            options={CHARGE_STATUSES.map((status) => ({
              value: status,
              label: tc(`billing.status.${status}`),
            }))}
            onChange={(value) => change({ status: value })}
          />
          <FilterSelect
            id="filter-professional"
            label={t("filterProfessional")}
            value={filters.professionalId}
            allLabel={t("all")}
            options={professionals.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => change({ professionalId: value })}
          />
          <FilterSelect
            id="filter-method"
            label={t("filterMethod")}
            value={filters.method}
            allLabel={t("all")}
            options={methods.map((method) => ({
              value: method,
              label: tc(`countries.paymentMethods.${method}`),
            }))}
            onChange={(value) => change({ method: value })}
          />
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          {t("newCharge")}
        </Button>
      </div>

      <div aria-busy={loading}>
        <ChargesTable
          charges={data.items}
          showPatient
          timeZone={timeZone}
          emptyText={t("noCharges")}
          rowAction={(charge) =>
            receivable(charge.status) ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setReceiving(charge.id)}>
                {t("receive")}
              </Button>
            ) : null
          }
        />
      </div>
      {data.nextCursor ? (
        <div>
          <Button type="button" variant="ghost" disabled={loading} onClick={() => void loadMore()}>
            {t("loadMore")}
          </Button>
        </div>
      ) : null}

      {data.totals.length > 0 ? (
        <section className="grid gap-2" aria-label={t("totals")}>
          <h3 className="section-title">{t("totals")}</h3>
          <div className="border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("currency")}</TableHead>
                  <TableHead className="text-right">{t("gross")}</TableHead>
                  <TableHead className="text-right">{t("discount")}</TableHead>
                  <TableHead className="text-right">{t("net")}</TableHead>
                  <TableHead className="text-right">{t("received")}</TableHead>
                  <TableHead className="text-right">{t("balanceColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.totals.map((total) => (
                  <TableRow key={total.currency}>
                    <TableCell className="font-mono">{total.currency}</TableCell>
                    <TableCell className="text-right font-mono">
                      {money(total.grossMinor, total.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {money(total.discountMinor, total.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {money(total.netMinor, total.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {money(total.paidMinor, total.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {money(total.balanceMinor, total.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {receiving ? (
        <ReceiveDialog
          chargeId={receiving}
          actions={actions}
          onDone={() => void reload(filters)}
          onClose={() => setReceiving(null)}
        />
      ) : null}
      {creating ? (
        <NewChargeDialog
          patient={null}
          actions={actions}
          onCreated={() => void reload(filters)}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  allLabel: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
