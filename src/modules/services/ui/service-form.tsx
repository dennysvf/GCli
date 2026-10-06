"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import type { ActionResult } from "@/shared/kernel/action-result";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/components/alert-dialog";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Switch } from "@/shared/ui/components/switch";
import { Textarea } from "@/shared/ui/components/textarea";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import { MoneyInput } from "@/shared/ui/forms/money-input";
import { useLocale } from "next-intl";
import { formatLocale, formatMoney } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/locales";
import type { CountryCode, Currency } from "@/shared/kernel/countries";
import { useFormDraft } from "@/shared/ui/forms/use-form-draft";
import { createServiceSchema } from "../application/schemas";
import type { SaveServiceResult, ServiceDetails } from "../application/services";
import type { ServiceColor } from "../domain/palette";
import { DURATION_OPTIONS, formatDuration } from "../domain/service-rules";
import { ColorPicker } from "@/shared/ui/palette/color-picker";
import { useTranslations } from "next-intl";

type Values = z.input<typeof createServiceSchema>;
type Parsed = z.output<typeof createServiceSchema>;

// A currency the service is priced in, with the country that decides its regional number format.
export type PriceCurrency = { currency: Currency; country: CountryCode | null };

export type SelectableRoom = { id: string; name: string; unitId: string; unitName: string };

const NEW_CATEGORY = "__new__";

function groupByUnit(rooms: SelectableRoom[]) {
  const units = new Map<string, { unitName: string; rooms: SelectableRoom[] }>();
  for (const room of rooms) {
    const unit = units.get(room.unitId) ?? { unitName: room.unitName, rooms: [] };
    unit.rooms.push(room);
    units.set(room.unitId, unit);
  }
  return [...units.entries()].map(([unitId, unit]) => ({ unitId, ...unit }));
}

// "R$ 250,00 → R$ 280,00; € 60,00 → € 65,00": only the prices that changed.
function priceChangeSummary(
  before: ServiceDetails["prices"],
  after: ServiceDetails["prices"],
  locale: Locale,
): string {
  return after
    .flatMap((price) => {
      const old = before.find((item) => item.currency === price.currency);
      if (old?.amountMinor === price.amountMinor) return [];
      const next = formatMoney(price, formatLocale(locale, null));
      return [old ? `${formatMoney(old, formatLocale(locale, null))} → ${next}` : next];
    })
    .join("; ");
}

export function ServiceForm({
  service,
  categories,
  rooms,
  defaultColor,
  currencies,
  readOnly = false,
  action,
  createCategoryAction,
  onSaved,
}: {
  service?: ServiceDetails;
  categories: { id: string; name: string }[];
  rooms: SelectableRoom[];
  defaultColor: ServiceColor;
  // Currencies of the active units: each one needs a price (PRD F16).
  currencies: PriceCurrency[];
  readOnly?: boolean;
  action: (
    input: Parsed & { serviceId?: string; version?: number },
  ) => Promise<ActionResult<SaveServiceResult>>;
  createCategoryAction: (input: { name: string }) => Promise<ActionResult<{ categoryId: string }>>;
  onSaved: (serviceId: string) => void;
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Parsed | null>(null);
  const [addedCategories, setAddedCategories] = useState<{ id: string; name: string }[]>([]);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [newCategoryError, setNewCategoryError] = useState<string | undefined>();

  // The currencies in use plus any other price the service already has, in a stable order.
  const priceCurrencies: PriceCurrency[] = [
    ...currencies,
    ...(service?.prices ?? [])
      .filter((price) => !currencies.some((item) => item.currency === price.currency))
      .map((price) => ({ currency: price.currency, country: null })),
  ];
  const locale = useLocale() as Locale;

  const defaults: Values = {
    name: service?.name ?? "",
    categoryId: service?.categoryId ?? categories[0]?.id ?? "",
    description: service?.description ?? "",
    durationMinutes: service?.durationMinutes ?? 30,
    prices: priceCurrencies.map(({ currency }) => ({
      currency,
      amountMinor: service?.prices.find((price) => price.currency === currency)?.amountMinor ?? 0,
    })),
    color: service?.color ?? defaultColor,
    requiresRoom: service?.requiresRoom ?? false,
    allowedRoomIds: service?.allowedRoomIds ?? [],
  };
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(createServiceSchema),
    defaultValues: defaults,
  });
  const draft = useFormDraft(`service-${service?.id ?? "new"}`, form);
  const { errors } = form.formState;
  const requiresRoom = useWatch({ control: form.control, name: "requiresRoom" });
  const allCategories = [
    ...categories,
    ...addedCategories.filter((c) => !categories.some((k) => k.id === c.id)),
  ];

  function save(values: Parsed) {
    startTransition(async () => {
      const result = await action(
        service ? { ...values, serviceId: service.id, version: service.version } : values,
      );
      // Server errors name a price by its currency ("prices.EUR"); the form lists them by position.
      const setError: typeof form.setError = (name, error, options) => {
        const currency = /^prices\.([A-Z]{3})$/.exec(name)?.[1];
        const index = priceCurrencies.findIndex((item) => item.currency === currency);
        form.setError(index >= 0 ? `prices.${index}.amountMinor` : name, error, options);
      };
      if (handleActionResult(result, { setError, successMessage: t("services.ui.serviceSaved") })) {
        draft.clear();
        onSaved(result.data.serviceId);
      }
    });
  }

  // PRD F03: after a price change the user is told existing appointments keep their price.
  const onSubmit = form.handleSubmit((values) => {
    const changed =
      !!service &&
      values.prices.some(
        (price) =>
          service.prices.find((old) => old.currency === price.currency)?.amountMinor !== price.amountMinor,
      );
    if (changed) setConfirming(values);
    else save(values);
  });

  function addCategory() {
    const name = newCategory?.trim() ?? "";
    startTransition(async () => {
      const result = await createCategoryAction({ name });
      if (!result.ok) {
        setNewCategoryError(result.error.fields?.name ?? result.error.message);
        return;
      }
      setAddedCategories((current) => [...current, { id: result.data.categoryId, name }]);
      form.setValue("categoryId", result.data.categoryId, { shouldDirty: true, shouldValidate: true });
      setNewCategory(null);
      setNewCategoryError(undefined);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <HydratedFieldset disabled={readOnly}>
        <Field id="service-name" label={t("common.name")} error={errors.name?.message}>
          <Input
            id="service-name"
            defaultValue={defaults.name}
            readOnly={readOnly}
            aria-invalid={!!errors.name}
            {...form.register("name")}
          />
        </Field>

        <Field id="service-category" label={t("common.category")} error={errors.categoryId?.message}>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <Select
                value={field.value}
                disabled={readOnly}
                onValueChange={(value) => {
                  if (value === NEW_CATEGORY) setNewCategory("");
                  else field.onChange(value);
                }}
              >
                <SelectTrigger id="service-category" className="w-full" aria-invalid={!!errors.categoryId}>
                  <SelectValue placeholder={t("services.ui.selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                  {readOnly ? null : (
                    <SelectItem value={NEW_CATEGORY}>{t("services.ui.addNewCategory")}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        {newCategory !== null ? (
          <Field id="service-new-category" label={t("services.ui.newCategory")} error={newCategoryError}>
            <div className="flex gap-2">
              <Input
                id="service-new-category"
                autoFocus
                maxLength={50}
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCategory();
                  }
                }}
              />
              <Button type="button" variant="secondary" disabled={pending} onClick={addCategory}>
                {t("common.add")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setNewCategory(null)}>
                {t("common.cancel")}
              </Button>
            </div>
          </Field>
        ) : null}

        <Field
          id="service-description"
          label={t("common.descriptionOptional")}
          error={errors.description?.message}
        >
          <Textarea
            id="service-description"
            rows={3}
            maxLength={500}
            defaultValue={defaults.description ?? ""}
            readOnly={readOnly}
            {...form.register("description")}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="service-duration"
            label={t("services.ui.duration")}
            error={errors.durationMinutes?.message}
          >
            <Controller
              control={form.control}
              name="durationMinutes"
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  disabled={readOnly}
                  onValueChange={(value) => field.onChange(Number(value))}
                >
                  <SelectTrigger id="service-duration" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {formatDuration(minutes)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {priceCurrencies.map(({ currency, country }, index) => {
            const message = errors.prices?.[index]?.amountMinor?.message;
            return (
              <Field
                key={currency}
                id={`service-price-${currency}`}
                label={
                  priceCurrencies.length > 1 ? t("services.ui.priceIn", { currency }) : t("services.ui.price")
                }
                error={message}
              >
                <Controller
                  control={form.control}
                  name={`prices.${index}.amountMinor`}
                  render={({ field }) => (
                    <MoneyInput
                      id={`service-price-${currency}`}
                      readOnly={readOnly}
                      aria-invalid={!!message}
                      currency={currency}
                      country={country}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              </Field>
            );
          })}
        </div>

        <Field id="service-color" label={t("services.ui.agendaColor")} error={errors.color?.message}>
          <Controller
            control={form.control}
            name="color"
            render={({ field }) => (
              <ColorPicker
                id="service-color"
                value={field.value}
                onChange={field.onChange}
                disabled={readOnly}
              />
            )}
          />
        </Field>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="grid gap-1">
            <label htmlFor="service-requires-room" className="text-sm font-medium">
              {t("services.ui.requiresRoom")}
            </label>
            <span className="text-muted-foreground text-xs">{t("services.ui.requiresRoomHint")}</span>
          </div>
          <Controller
            control={form.control}
            name="requiresRoom"
            render={({ field }) => (
              <Switch
                id="service-requires-room"
                checked={field.value}
                disabled={readOnly}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  // Allowed rooms only apply to services that require a room (spec F03).
                  if (!checked) form.setValue("allowedRoomIds", [], { shouldDirty: true });
                }}
              />
            )}
          />
        </div>

        {requiresRoom ? (
          <fieldset className="grid gap-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">{t("services.ui.allowedRooms")}</legend>
            <p className="text-muted-foreground text-xs">{t("services.ui.allowedRoomsHint")}</p>
            {errors.allowedRoomIds?.message ? (
              <p role="alert" className="text-destructive text-sm">
                {errors.allowedRoomIds.message}
              </p>
            ) : null}
            {rooms.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("services.ui.noActiveRooms")}</p>
            ) : (
              <Controller
                control={form.control}
                name="allowedRoomIds"
                render={({ field }) => {
                  const selected = new Set(field.value ?? []);
                  return (
                    <div className="grid gap-3">
                      {groupByUnit(rooms).map((unit) => (
                        <div key={unit.unitId} role="group" aria-label={unit.unitName} className="grid gap-1">
                          <span className="text-sm font-medium">{unit.unitName}</span>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {unit.rooms.map((room) => (
                              <label key={room.id} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="accent-primary size-4"
                                  checked={selected.has(room.id)}
                                  disabled={readOnly}
                                  onChange={(event) => {
                                    const next = new Set(selected);
                                    if (event.target.checked) next.add(room.id);
                                    else next.delete(room.id);
                                    field.onChange([...next]);
                                  }}
                                />
                                {room.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
            )}
          </fieldset>
        ) : null}

        {readOnly ? null : (
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : service ? t("common.save") : t("services.ui.createService")}
            </Button>
          </div>
        )}
      </HydratedFieldset>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("services.ui.changePrice")}</AlertDialogTitle>
            <AlertDialogDescription>
              {service && confirming
                ? `${priceChangeSummary(service.prices, confirming.prices, locale)}. `
                : null}
              {t("services.ui.priceChangeNote")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming) save(confirming);
                setConfirming(null);
              }}
            >
              {t("services.ui.saveNewPrice")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
