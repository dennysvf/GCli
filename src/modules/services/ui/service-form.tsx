"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import type { ActionResult } from "@/shared/kernel/action-result";
import { formatCents } from "@/shared/kernel/money";
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
import { useFormDraft } from "@/shared/ui/forms/use-form-draft";
import { createServiceSchema } from "../application/schemas";
import type { SaveServiceResult, ServiceDetails } from "../application/services";
import type { ServiceColor } from "../domain/palette";
import { DURATION_OPTIONS, formatDuration } from "../domain/service-rules";
import { SERVICES_PRICE_CHANGE_CONFIRMATION } from "../messages";
import { ColorPicker } from "@/shared/ui/palette/color-picker";

type Values = z.input<typeof createServiceSchema>;
type Parsed = z.output<typeof createServiceSchema>;

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

export function ServiceForm({
  service,
  categories,
  rooms,
  defaultColor,
  readOnly = false,
  action,
  createCategoryAction,
  onSaved,
}: {
  service?: ServiceDetails;
  categories: { id: string; name: string }[];
  rooms: SelectableRoom[];
  defaultColor: ServiceColor;
  readOnly?: boolean;
  action: (
    input: Parsed & { serviceId?: string; version?: number },
  ) => Promise<ActionResult<SaveServiceResult>>;
  createCategoryAction: (input: { name: string }) => Promise<ActionResult<{ categoryId: string }>>;
  onSaved: (serviceId: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Parsed | null>(null);
  const [addedCategories, setAddedCategories] = useState<{ id: string; name: string }[]>([]);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [newCategoryError, setNewCategoryError] = useState<string | undefined>();

  const defaults: Values = {
    name: service?.name ?? "",
    categoryId: service?.categoryId ?? categories[0]?.id ?? "",
    description: service?.description ?? "",
    durationMinutes: service?.durationMinutes ?? 30,
    priceCents: service?.priceCents ?? 0,
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
      if (handleActionResult(result, { setError: form.setError, successMessage: "Serviço salvo" })) {
        draft.clear();
        onSaved(result.data.serviceId);
      }
    });
  }

  // PRD F03: after a price change the user is told existing appointments keep their price.
  const onSubmit = form.handleSubmit((values) => {
    if (service && values.priceCents !== service.priceCents) setConfirming(values);
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
        <Field id="service-name" label="Nome" error={errors.name?.message}>
          <Input
            id="service-name"
            defaultValue={defaults.name}
            readOnly={readOnly}
            aria-invalid={!!errors.name}
            {...form.register("name")}
          />
        </Field>

        <Field id="service-category" label="Categoria" error={errors.categoryId?.message}>
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
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                  {readOnly ? null : <SelectItem value={NEW_CATEGORY}>+ Nova categoria</SelectItem>}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        {newCategory !== null ? (
          <Field id="service-new-category" label="Nova categoria" error={newCategoryError}>
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
                Adicionar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setNewCategory(null)}>
                Cancelar
              </Button>
            </div>
          </Field>
        ) : null}

        <Field id="service-description" label="Descrição (opcional)" error={errors.description?.message}>
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
          <Field id="service-duration" label="Duração" error={errors.durationMinutes?.message}>
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
          <Field id="service-price" label="Preço" error={errors.priceCents?.message}>
            <Controller
              control={form.control}
              name="priceCents"
              render={({ field }) => (
                <MoneyInput
                  id="service-price"
                  readOnly={readOnly}
                  aria-invalid={!!errors.priceCents}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </Field>
        </div>

        <Field id="service-color" label="Cor na agenda" error={errors.color?.message}>
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
              Exige sala
            </label>
            <span className="text-muted-foreground text-xs">
              O agendamento deste serviço precisará de uma sala.
            </span>
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
            <legend className="px-1 text-sm font-medium">Salas permitidas</legend>
            <p className="text-muted-foreground text-xs">
              Em cada unidade, se nenhuma sala for marcada, qualquer sala ativa poderá ser usada.
            </p>
            {errors.allowedRoomIds?.message ? (
              <p role="alert" className="text-destructive text-sm">
                {errors.allowedRoomIds.message}
              </p>
            ) : null}
            {rooms.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma sala ativa cadastrada.</p>
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
              {pending ? "Salvando..." : service ? "Salvar" : "Criar serviço"}
            </Button>
          </div>
        )}
      </HydratedFieldset>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar preço</AlertDialogTitle>
            <AlertDialogDescription>
              {service && confirming
                ? `${formatCents(service.priceCents)} → ${formatCents(confirming.priceCents)}. `
                : null}
              {SERVICES_PRICE_CHANGE_CONFIRMATION}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming) save(confirming);
                setConfirming(null);
              }}
            >
              Salvar novo preço
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
