"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { MoneyInput } from "@/shared/ui/forms/money-input";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { TemplateItem } from "../application/templates";
import type { PackagesActions } from "./packages-actions";

const NEW = "new" as const;

type ServiceOption = { id: string; name: string; prices: { currency: string; amountMinor: number }[] };
type SettingsActions = Pick<PackagesActions, "saveTemplate" | "setTemplateActive" | "setNoShowDebit">;

// Configurações > Pacotes (PRD F10 Experience): the templates and the no-show setting.
export function TemplatesPanel({
  templates,
  services,
  currencies,
  noShowDebit,
  actions,
}: {
  templates: TemplateItem[];
  services: ServiceOption[];
  currencies: string[];
  noShowDebit: boolean;
  actions: SettingsActions;
}) {
  const t = useTranslations("packages.ui");
  const router = useRouter();
  const money = useMoney();
  const [editing, setEditing] = useState<TemplateItem | typeof NEW | null>(null);
  const [debit, setDebit] = useState(noShowDebit);
  const [pending, startTransition] = useTransition();

  function toggleNoShow(enabled: boolean) {
    startTransition(async () => {
      const result = await actions.setNoShowDebit({ enabled });
      if (handleActionResult(result, { successMessage: t("settingSavedToast") })) setDebit(enabled);
    });
  }

  function toggleActive(template: TemplateItem) {
    startTransition(async () => {
      const result = await actions.setTemplateActive({
        templateId: template.id,
        version: template.version,
        active: !template.active,
      });
      if (handleActionResult(result)) router.refresh();
    });
  }

  return (
    <div className="grid gap-8">
      <section className="flex items-center gap-3" aria-label={t("noShowTitle")}>
        <Switch id="no-show-debit" checked={debit} disabled={pending} onCheckedChange={toggleNoShow} />
        <Label htmlFor="no-show-debit">{t("noShowDebit")}</Label>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">{t("templates")}</h2>
          <Button type="button" onClick={() => setEditing(NEW)}>
            {t("newTemplate")}
          </Button>
        </div>
        {templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noTemplates")}</p>
        ) : (
          <div className="border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("service")}</TableHead>
                  <TableHead className="text-right">{t("sessions")}</TableHead>
                  <TableHead className="text-right">{t("validityDays")}</TableHead>
                  <TableHead className="text-right">{t("price")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-semibold">{template.name}</TableCell>
                    <TableCell>{template.serviceName}</TableCell>
                    <TableCell className="text-right">{template.sessions}</TableCell>
                    <TableCell className="text-right">{template.validityDays}</TableCell>
                    <TableCell className="text-right font-mono">
                      {template.prices.map((price) => money(price.amountMinor, price.currency)).join(" · ")}
                    </TableCell>
                    <TableCell>
                      <Stamp variant={template.active ? "success" : "neutral"}>
                        {template.active ? t("active") : t("inactive")}
                      </Stamp>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(template)}>
                          {t("edit")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => toggleActive(template)}
                        >
                          {template.active ? t("deactivate") : t("activate")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {editing ? (
        <TemplateForm
          template={editing === NEW ? null : editing}
          services={services}
          currencies={currencies}
          actions={actions}
          onSaved={() => router.refresh()}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function useMoney() {
  const format = useFormatters();
  return (amountMinor: number, currency: string) =>
    format.money({ amountMinor, currency: currency as Currency });
}

function TemplateForm({
  template,
  services,
  currencies,
  actions,
  onSaved,
  onClose,
}: {
  template: TemplateItem | null;
  services: ServiceOption[];
  currencies: string[];
  actions: Pick<PackagesActions, "saveTemplate">;
  onSaved: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("packages.ui");
  const format = useFormatters();
  const money = useMoney();
  const [name, setName] = useState(template?.name ?? "");
  const [serviceId, setServiceId] = useState(template?.serviceId ?? "");
  const [sessions, setSessions] = useState(String(template?.sessions ?? 10));
  const [validity, setValidity] = useState(String(template?.validityDays ?? 180));
  const [prices, setPrices] = useState<Record<string, number>>(
    Object.fromEntries((template?.prices ?? []).map((price) => [price.currency, price.amountMinor])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const service = services.find((item) => item.id === serviceId);
  const count = Number(sessions);

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await actions.saveTemplate({
        ...(template ? { templateId: template.id, version: template.version } : {}),
        name: name.trim(),
        serviceId,
        sessions: count,
        validityDays: Number(validity),
        prices: Object.entries(prices)
          .filter(([, amount]) => amount > 0)
          .map(([currency, amountMinor]) => ({ currency, amountMinor })),
        active: template?.active ?? true,
      });
      if (!result.ok && result.error.fields) {
        setErrors(result.error.fields);
        return;
      }
      if (!handleActionResult(result, { successMessage: t("templateSavedToast") })) return;
      onSaved();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{template ? t("editTemplate") : t("newTemplate")}</DialogTitle>
            <DialogDescription>{t("templateHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1">
            <Label htmlFor="template-name">{t("name")}</Label>
            <Input
              id="template-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
            {errors.name ? <p className="text-destructive text-sm">{errors.name}</p> : null}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="template-service">{t("service")}</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger id="template-service">
                <SelectValue placeholder={t("chooseService")} />
              </SelectTrigger>
              <SelectContent>
                {services.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="template-sessions">{t("sessions")}</Label>
              <Input
                id="template-sessions"
                type="number"
                min={2}
                max={100}
                value={sessions}
                onChange={(event) => setSessions(event.target.value)}
              />
              {errors.sessions ? <p className="text-destructive text-sm">{errors.sessions}</p> : null}
            </div>
            <div className="grid gap-1">
              <Label htmlFor="template-validity">{t("validityDays")}</Label>
              <Input
                id="template-validity"
                type="number"
                min={30}
                max={730}
                value={validity}
                onChange={(event) => setValidity(event.target.value)}
              />
              {errors.validityDays ? <p className="text-destructive text-sm">{errors.validityDays}</p> : null}
            </div>
          </div>
          <div className="grid gap-3">
            {currencies.map((currency) => {
              const total = prices[currency] ?? 0;
              const perSession = count >= 2 ? Math.floor(total / count) : 0;
              const regular = service?.prices.find((price) => price.currency === currency)?.amountMinor ?? 0;
              const discount =
                regular > 0 && perSession > 0 ? Math.round((1 - perSession / regular) * 100) : null;
              return (
                <div key={currency} className="grid gap-1">
                  <Label htmlFor={`template-price-${currency}`}>{t("priceIn", { currency })}</Label>
                  <MoneyInput
                    id={`template-price-${currency}`}
                    currency={currency as Currency}
                    value={total}
                    onChange={(amount) => setPrices((current) => ({ ...current, [currency]: amount }))}
                  />
                  {perSession > 0 ? (
                    <p className="text-muted-foreground text-xs">
                      {t("perSession", { price: money(perSession, currency) })}
                      {discount !== null
                        ? ` · ${t("discountVersusRegular", { percent: format.number(discount) })}`
                        : ""}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {errors.prices ? <p className="text-destructive text-sm">{errors.prices}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim() || !serviceId}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
