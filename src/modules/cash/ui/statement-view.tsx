"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Currency } from "@/shared/kernel/countries/codes";
import { Alert } from "@/shared/ui/components/alert";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { StatementView as StatementData } from "../application/statement";
import type { StatementSource } from "../domain/statement";
import type { FinanceActions } from "./cash-actions";

const ALL = "ALL";
const GENERAL = "GENERAL";
const AUTO = "AUTO";

const SOURCE_KEYS: Record<StatementSource, string> = {
  PATIENT: "sourcePatient",
  REVENUE: "sourceRevenue",
  EXPENSE: "sourceExpense",
  CASH_IN: "sourceCashIn",
  CASH_OUT: "sourceCashOut",
};

// Financeiro > Extrato (PRD F11): the previous balance, the lines of the period with a running
// balance in one currency, the totals per category and the result of the period.
export function StatementView({
  initial,
  initialError,
  initialFilters,
  units,
  currencies,
  actions,
}: {
  initial: StatementData | null;
  initialError: string | null;
  initialFilters: { unit: string; from: string; to: string; currency: string | null };
  units: { id: string; name: string }[];
  currencies: string[];
  actions: Pick<FinanceActions, "statement">;
}) {
  const t = useTranslations("cash.ui");
  const format = useFormatters();
  const [statement, setStatement] = useState(initial);
  const [error, setError] = useState(initialError);
  const [filters, setFilters] = useState(initialFilters);
  const [pending, startTransition] = useTransition();

  function run(next: typeof filters) {
    setFilters(next);
    startTransition(async () => {
      const result = await actions.statement({
        unit: next.unit,
        from: next.from,
        to: next.to,
        currency: next.currency,
      });
      if (result.ok) {
        setStatement(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    });
  }

  const money = (minor: number) =>
    format.money({ amountMinor: minor, currency: (statement?.currency ?? "BRL") as Currency });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <Label htmlFor="statement-unit">{t("unit")}</Label>
          <Select value={filters.unit} onValueChange={(value) => run({ ...filters, unit: value })}>
            <SelectTrigger id="statement-unit" className="min-w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allUnits")}</SelectItem>
              <SelectItem value={GENERAL}>{t("general")}</SelectItem>
              {units.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="statement-from">{t("from")}</Label>
          <Input
            id="statement-from"
            type="date"
            value={filters.from}
            onChange={(e) => e.target.value && run({ ...filters, from: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="statement-to">{t("to")}</Label>
          <Input
            id="statement-to"
            type="date"
            value={filters.to}
            onChange={(e) => e.target.value && run({ ...filters, to: e.target.value })}
          />
        </div>
        {currencies.length > 1 ? (
          <div className="grid gap-1">
            <Label htmlFor="statement-currency">{t("currency")}</Label>
            <Select
              value={filters.currency ?? AUTO}
              onValueChange={(value) => run({ ...filters, currency: value === AUTO ? null : value })}
            >
              <SelectTrigger id="statement-currency" className="min-w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO}>{t("chooseCurrency")}</SelectItem>
                {currencies.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      {statement && !error ? (
        <div className="grid gap-6" aria-busy={pending}>
          <div className="border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("source")}</TableHead>
                  <TableHead>{t("description")}</TableHead>
                  <TableHead>{t("category")}</TableHead>
                  <TableHead className="text-right">{t("inflow")}</TableHead>
                  <TableHead className="text-right">{t("outflow")}</TableHead>
                  <TableHead className="text-right">{t("balance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>{format.shortDate(statement.from)}</TableCell>
                  <TableCell colSpan={5} className="font-semibold">
                    {t("previousBalance")}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {money(statement.previousBalanceMinor)}
                  </TableCell>
                </TableRow>
                {statement.lines.map((line, index) => (
                  <TableRow key={`${line.date}-${index}`}>
                    <TableCell>{format.shortDate(line.date)}</TableCell>
                    <TableCell>{t(SOURCE_KEYS[line.source])}</TableCell>
                    <TableCell>
                      <div className="grid">
                        <span>{line.description}</span>
                        {line.reference ? (
                          <span className="text-muted-foreground text-xs">
                            {t("chargeNumber", { number: line.reference })}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{line.category ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {line.inMinor ? money(line.inMinor) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {line.outMinor ? money(line.outMinor) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{money(line.balanceMinor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <section className="grid gap-2" aria-label={t("totalsByCategory")}>
            <h2 className="section-title">{t("totalsByCategory")}</h2>
            {statement.totalsByCategory.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noStatementLines")}</p>
            ) : (
              <div className="border-y">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("source")}</TableHead>
                      <TableHead>{t("category")}</TableHead>
                      <TableHead className="text-right">{t("total")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statement.totalsByCategory.map((row) => (
                      <TableRow key={`${row.source}-${row.category ?? ""}`}>
                        <TableCell>{t(SOURCE_KEYS[row.source])}</TableCell>
                        <TableCell>{row.category ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono">{money(row.totalMinor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <dl className="grid max-w-sm grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("periodResult")}</dt>
            <dd className="text-right font-mono">{money(statement.resultMinor)}</dd>
            <dt className="font-semibold">{t("closingBalance")}</dt>
            <dd className="text-right font-mono font-semibold">{money(statement.closingBalanceMinor)}</dd>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
