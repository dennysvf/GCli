"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { Currency } from "@/shared/kernel/countries/codes";
import { Button } from "@/shared/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/components/dialog";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Stamp } from "@/shared/ui/components/stamp";
import { Switch } from "@/shared/ui/components/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { Textarea } from "@/shared/ui/components/textarea";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { MoneyInput } from "@/shared/ui/forms/money-input";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { EntryList, EntryView } from "../application/entries";
import type { CategoryRecord } from "../application/ports";
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from "../domain/limits";
import { AttachmentField } from "./attachment-field";
import type { FinanceActions } from "./cash-actions";
import { openInNewTab } from "./open-link";

type UnitOption = { id: string; name: string; currency: string };
type Filters = { from: string; to: string; categoryId: string; unit: string; status: string };
const DIALOG = { form: "form", pay: "pay", reverse: "reverse", delete: "delete", end: "end" } as const;

type Dialog =
  | { kind: "form"; entry: EntryView | null }
  | { kind: "pay"; entry: EntryView }
  | { kind: "reverse"; entry: EntryView }
  | { kind: "delete"; entry: EntryView }
  | { kind: "end"; entry: EntryView };

const ALL = "ALL";
const GENERAL = "GENERAL";

function Modal({
  title,
  hint,
  submitLabel,
  submitDisabled,
  danger = false,
  pending,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  hint: string;
  submitLabel: string;
  submitDisabled: boolean;
  danger?: boolean;
  pending: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("cash.ui");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <form
          className="grid gap-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!submitDisabled && !pending) onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{hint}</DialogDescription>
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              variant={danger ? "destructive" : "default"}
              disabled={submitDisabled || pending}
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Financeiro > Despesas and Receitas (PRD F11): one component for both kinds. Overdue unpaid entries
// carry a stamp and the date in the destructive color, never color alone.
export function EntriesView({
  kind,
  initial,
  initialFilters,
  units,
  categories,
  methodsFor,
  actions,
}: {
  kind: "EXPENSE" | "REVENUE";
  initial: EntryList;
  initialFilters: { from: string; to: string };
  units: UnitOption[];
  categories: CategoryRecord[];
  methodsFor: Record<string, string[]>;
  actions: FinanceActions;
}) {
  const t = useTranslations("cash.ui");
  const tc = useTranslations();
  const format = useFormatters();
  const [list, setList] = useState(initial);
  const [filters, setFilters] = useState<Filters>({
    ...initialFilters,
    categoryId: ALL,
    unit: ALL,
    status: ALL,
  });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pending, startTransition] = useTransition();
  const expense = kind === "EXPENSE";
  const kindCategories = categories.filter((category) => category.kind === kind);

  function reload(next: Filters = filters) {
    startTransition(async () => {
      const result = await actions.listEntries({
        kind,
        from: next.from || null,
        to: next.to || null,
        categoryId: next.categoryId === ALL ? null : next.categoryId,
        unit: next.unit,
        status: next.status === ALL ? null : (next.status as "PENDING" | "PAID" | "OVERDUE"),
      });
      if (handleActionResult(result)) setList(result.data);
    });
  }

  function change(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    reload(next);
  }

  const money = (entry: EntryView) =>
    format.money({ amountMinor: entry.amountMinor, currency: entry.currency as Currency });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <Label htmlFor="entries-from">{t("from")}</Label>
          <Input
            id="entries-from"
            type="date"
            value={filters.from}
            onChange={(e) => change({ from: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="entries-to">{t("to")}</Label>
          <Input
            id="entries-to"
            type="date"
            value={filters.to}
            onChange={(e) => change({ to: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="entries-category">{t("category")}</Label>
          <Select value={filters.categoryId} onValueChange={(value) => change({ categoryId: value })}>
            <SelectTrigger id="entries-category" className="min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allCategories")}</SelectItem>
              {kindCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="entries-unit">{t("unit")}</Label>
          <Select value={filters.unit} onValueChange={(value) => change({ unit: value })}>
            <SelectTrigger id="entries-unit" className="min-w-40">
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
          <Label htmlFor="entries-status">{t("status")}</Label>
          <Select value={filters.status} onValueChange={(value) => change({ status: value })}>
            <SelectTrigger id="entries-status" className="min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
              <SelectItem value="PENDING">{expense ? t("statusToPay") : t("statusToReceive")}</SelectItem>
              <SelectItem value="OVERDUE">{t("statusOverdue")}</SelectItem>
              <SelectItem value="PAID">{expense ? t("statusPaid") : t("statusReceived")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          className="ml-auto"
          onClick={() => setDialog({ kind: DIALOG.form, entry: null })}
        >
          {expense ? t("newExpense") : t("newRevenue")}
        </Button>
      </div>

      {list.entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{expense ? t("noExpenses") : t("noRevenues")}</p>
      ) : (
        <div className="border-y" aria-busy={pending}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("dueDate")}</TableHead>
                <TableHead>{t("description")}</TableHead>
                <TableHead>{t("category")}</TableHead>
                <TableHead>{t("unit")}</TableHead>
                <TableHead className="text-right">{t("amount")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className={entry.overdue ? "text-destructive font-semibold" : undefined}>
                    {format.shortDate(entry.dueDate)}
                  </TableCell>
                  <TableCell>
                    <div className="grid">
                      <span>{entry.description}</span>
                      {entry.recurring ? (
                        <span className="text-muted-foreground text-xs">{t("repeatsMonthly")}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{entry.categoryName}</TableCell>
                  <TableCell>{entry.unitName ?? t("general")}</TableCell>
                  <TableCell className="text-right font-mono">{money(entry)}</TableCell>
                  <TableCell>
                    {entry.status === "PAID" ? (
                      <Stamp variant="success">
                        {expense ? t("statusPaid") : t("statusReceived")}
                        {entry.paymentMethod
                          ? ` · ${tc(`countries.paymentMethods.${entry.paymentMethod}`)}`
                          : ""}
                      </Stamp>
                    ) : entry.overdue ? (
                      <Stamp variant="danger">{t("statusOverdue")}</Stamp>
                    ) : (
                      <Stamp variant="neutral">{expense ? t("statusToPay") : t("statusToReceive")}</Stamp>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {entry.status === "PENDING" ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setDialog({ kind: DIALOG.pay, entry })}
                          >
                            {expense ? t("markPaid") : t("markReceived")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setDialog({ kind: DIALOG.form, entry })}
                          >
                            {t("edit")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setDialog({ kind: DIALOG.delete, entry })}
                          >
                            {t("delete")}
                          </Button>
                          {entry.seriesId ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setDialog({ kind: DIALOG.end, entry })}
                            >
                              {t("endSeries")}
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setDialog({ kind: DIALOG.reverse, entry })}
                        >
                          {t("reversePayment")}
                        </Button>
                      )}
                      {entry.attachmentId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const link = await actions.downloadUrl({
                              attachmentId: entry.attachmentId ?? "",
                            });
                            if (link.ok) openInNewTab(link.data.url);
                          }}
                        >
                          {t("receipt")}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog?.kind === "form" ? (
        <EntryForm
          kind={kind}
          entry={dialog.entry}
          units={units}
          categories={kindCategories}
          actions={actions}
          onDone={() => reload()}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "pay" ? (
        <PayDialog
          entry={dialog.entry}
          today={list.today}
          methods={methodsFor[dialog.entry.unitId ?? GENERAL] ?? methodsFor[GENERAL] ?? []}
          actions={actions}
          onDone={() => reload()}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "reverse" ? (
        <ReversePaymentDialog
          entry={dialog.entry}
          actions={actions}
          onDone={() => reload()}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteDialog
          entry={dialog.entry}
          actions={actions}
          onDone={() => reload()}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "end" && dialog.entry.seriesId ? (
        <EndSeriesDialog
          seriesId={dialog.entry.seriesId}
          actions={actions}
          onDone={() => reload()}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

function EntryForm({
  kind,
  entry,
  units,
  categories,
  actions,
  onDone,
  onClose,
}: {
  kind: "EXPENSE" | "REVENUE";
  entry: EntryView | null;
  units: UnitOption[];
  categories: CategoryRecord[];
  actions: FinanceActions;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("cash.ui");
  const expense = kind === "EXPENSE";
  const currencies = [...new Set(units.map((unit) => unit.currency))];
  const [description, setDescription] = useState(entry?.description ?? "");
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? "");
  const [unitId, setUnitId] = useState<string>(entry ? (entry.unitId ?? GENERAL) : (units[0]?.id ?? GENERAL));
  const [currency, setCurrency] = useState(entry?.currency ?? units[0]?.currency ?? currencies[0] ?? "BRL");
  const [amount, setAmount] = useState(entry?.amountMinor ?? 0);
  const [dueDate, setDueDate] = useState(entry?.dueDate ?? "");
  const [repeat, setRepeat] = useState(false);
  const [scope, setScope] = useState<"ONE" | "FOLLOWING">("ONE");
  const [attachment, setAttachment] = useState<{ id: string; name: string } | null>(
    entry?.attachmentId ? { id: entry.attachmentId, name: entry.attachmentName ?? "" } : null,
  );
  const [pending, startTransition] = useTransition();
  const unit = units.find((item) => item.id === unitId);
  const effectiveCurrency = unit ? unit.currency : currency;
  const valid = description.trim().length >= 3 && categoryId !== "" && amount > 0 && dueDate !== "";

  function submit() {
    startTransition(async () => {
      const fields = {
        description: description.trim(),
        categoryId,
        unitId: unitId === GENERAL ? null : unitId,
        currency: effectiveCurrency,
        amountMinor: amount,
        dueDate,
        attachmentId: attachment?.id ?? null,
      };
      const saved = entry
        ? handleActionResult(
            await actions.updateEntry({ ...fields, entryId: entry.id, version: entry.version, scope }),
            {
              successMessage: t("entrySavedToast"),
            },
          )
        : handleActionResult(
            await actions.createEntry({ ...fields, kind, repeatMonthly: repeat, paid: null }),
            {
              successMessage: t("entrySavedToast"),
            },
          );
      if (!saved) return;
      onDone();
      onClose();
    });
  }

  return (
    <Modal
      title={entry ? t("editEntry") : expense ? t("newExpense") : t("newRevenue")}
      hint={t("entryHint")}
      submitLabel={t("save")}
      submitDisabled={!valid}
      pending={pending}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="grid gap-1">
        <Label htmlFor="entry-description">{t("description")}</Label>
        <Input
          id="entry-description"
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="entry-category">{t("category")}</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="entry-category">
            <SelectValue placeholder={t("chooseCategory")} />
          </SelectTrigger>
          <SelectContent>
            {categories
              .filter((category) => category.active || category.id === entry?.categoryId)
              .map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="entry-unit">{t("unit")}</Label>
        <Select value={unitId} onValueChange={setUnitId}>
          <SelectTrigger id="entry-unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GENERAL}>{t("general")}</SelectItem>
            {units.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {unitId === GENERAL && currencies.length > 1 ? (
        <div className="grid gap-1">
          <Label htmlFor="entry-currency">{t("currency")}</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="entry-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="grid gap-1">
        <Label htmlFor="entry-amount">{t("amount")}</Label>
        <MoneyInput
          id="entry-amount"
          currency={effectiveCurrency as Currency}
          value={amount}
          onChange={setAmount}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="entry-due">{t("dueDate")}</Label>
        <Input id="entry-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      {!entry ? (
        <div className="flex items-center gap-3">
          <Switch id="entry-repeat" checked={repeat} onCheckedChange={setRepeat} />
          <Label htmlFor="entry-repeat">{t("repeatMonthly")}</Label>
        </div>
      ) : entry.recurring ? (
        <div className="grid gap-1">
          <Label htmlFor="entry-scope">{t("scope")}</Label>
          <Select value={scope} onValueChange={(value) => setScope(value as "ONE" | "FOLLOWING")}>
            <SelectTrigger id="entry-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ONE">{t("scopeOne")}</SelectItem>
              <SelectItem value="FOLLOWING">{t("scopeFollowing")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <AttachmentField
        id="entry-attachment"
        value={attachment?.id ?? null}
        fileName={attachment?.name ?? null}
        onChange={setAttachment}
        actions={actions}
      />
    </Modal>
  );
}

function PayDialog({
  entry,
  today,
  methods,
  actions,
  onDone,
  onClose,
}: {
  entry: EntryView;
  today: string;
  methods: string[];
  actions: FinanceActions;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("cash.ui");
  const tc = useTranslations();
  const expense = entry.kind === "EXPENSE";
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState(methods[0] ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await actions.payEntry({ entryId: entry.id, paidOn, method });
      if (!handleActionResult(result, { successMessage: expense ? t("paidToast") : t("receivedToast") }))
        return;
      onDone();
      onClose();
    });
  }

  return (
    <Modal
      title={expense ? t("markPaid") : t("markReceived")}
      hint={entry.description}
      submitLabel={t("confirm")}
      submitDisabled={!paidOn || !method}
      pending={pending}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="grid gap-1">
        <Label htmlFor="pay-date">{t("paymentDate")}</Label>
        <Input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="pay-method">{t("method")}</Label>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger id="pay-method">
            <SelectValue placeholder={t("chooseMethod")} />
          </SelectTrigger>
          <SelectContent>
            {methods.map((item) => (
              <SelectItem key={item} value={item}>
                {tc(`countries.paymentMethods.${item}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Modal>
  );
}

function ReversePaymentDialog({
  entry,
  actions,
  onDone,
  onClose,
}: {
  entry: EntryView;
  actions: FinanceActions;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("cash.ui");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await actions.reverseEntryPayment({ entryId: entry.id, reason: reason.trim() });
      if (!handleActionResult(result, { successMessage: t("paymentReversedToast") })) return;
      onDone();
      onClose();
    });
  }

  return (
    <Modal
      title={t("reversePayment")}
      hint={entry.description}
      submitLabel={t("confirmReverse")}
      submitDisabled={reason.trim().length < REASON_MIN_LENGTH}
      danger
      pending={pending}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="grid gap-1">
        <Label htmlFor="reverse-payment-reason">{t("reason")}</Label>
        <Textarea
          id="reverse-payment-reason"
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          {t("reasonHint", { min: REASON_MIN_LENGTH, count: reason.trim().length })}
        </p>
      </div>
    </Modal>
  );
}

function DeleteDialog({
  entry,
  actions,
  onDone,
  onClose,
}: {
  entry: EntryView;
  actions: FinanceActions;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("cash.ui");
  const [scope, setScope] = useState<"ONE" | "FOLLOWING">("ONE");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await actions.deleteEntry({ entryId: entry.id, scope });
      if (!handleActionResult(result, { successMessage: t("deletedToast") })) return;
      onDone();
      onClose();
    });
  }

  return (
    <Modal
      title={t("delete")}
      hint={t("deleteHint", { description: entry.description })}
      submitLabel={t("confirmDelete")}
      submitDisabled={false}
      danger
      pending={pending}
      onSubmit={submit}
      onClose={onClose}
    >
      {entry.recurring ? (
        <div className="grid gap-1">
          <Label htmlFor="delete-scope">{t("scope")}</Label>
          <Select value={scope} onValueChange={(value) => setScope(value as "ONE" | "FOLLOWING")}>
            <SelectTrigger id="delete-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ONE">{t("scopeOne")}</SelectItem>
              <SelectItem value="FOLLOWING">{t("scopeFollowing")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </Modal>
  );
}

function EndSeriesDialog({
  seriesId,
  actions,
  onDone,
  onClose,
}: {
  seriesId: string;
  actions: FinanceActions;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("cash.ui");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await actions.endSeries({ seriesId });
      if (!handleActionResult(result, { successMessage: t("seriesEndedToast") })) return;
      onDone();
      onClose();
    });
  }

  return (
    <Modal
      title={t("endSeries")}
      hint={t("endSeriesHint")}
      submitLabel={t("confirmEndSeries")}
      submitDisabled={false}
      danger
      pending={pending}
      onSubmit={submit}
      onClose={onClose}
    >
      <p className="text-sm">{t("endSeriesHint")}</p>
    </Modal>
  );
}
