"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/components/select";
import { Field } from "@/shared/ui/forms/field";
import type { AuditFilterOptions } from "../application/views";

export type AuditFilterState = {
  from: string;
  to: string;
  user: string;
  action: string;
  entityType: string;
  entityId: string;
};

export type AuditFieldErrors = Partial<Record<keyof AuditFilterState, string>>;

const ALL = "ALL";
const SYSTEM = "SYSTEM";
// Spec F15 decision D9: the id field applies 300 ms after the last keystroke.
const ID_DEBOUNCE_MS = 300;

// The filter bar of the audit log (design system 5.19): De, Até, Usuário, Ação, Tipo de entidade
// (grouped), Id da entidade (enabled once a type is chosen) and "Limpar filtros". Filters apply on
// change; there is no primary button here.
export function AuditFilters({
  value,
  options,
  errors,
  onChange,
  onClear,
}: {
  value: AuditFilterState;
  options: AuditFilterOptions;
  errors: AuditFieldErrors;
  onChange: (next: AuditFilterState) => void;
  onClear: () => void;
}) {
  const t = useTranslations("audit");
  const set = (patch: Partial<AuditFilterState>) => onChange({ ...value, ...patch });
  const [entityId, setEntityId] = useState(value.entityId);
  const typed = useRef(false);
  const latest = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    latest.current = value;
    onChangeRef.current = onChange;
  });

  // The field follows the filters when they change from outside (clear, "Filtrar por esta entidade").
  const [shown, setShown] = useState(value.entityId);
  if (shown !== value.entityId) {
    setShown(value.entityId);
    setEntityId(value.entityId);
  }

  useEffect(() => {
    if (!typed.current) return;
    const timer = setTimeout(() => {
      typed.current = false;
      if (entityId.trim() !== latest.current.entityId)
        onChangeRef.current({ ...latest.current, entityId: entityId.trim() });
    }, ID_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [entityId]);

  const periodError = errors.to ?? errors.from;
  const noType = value.entityType === ALL;

  return (
    <div
      role="group"
      aria-label={t("filters.group")}
      className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b pb-4"
    >
      <Field id="audit-from" label={t("filters.from")}>
        <Input
          id="audit-from"
          type="date"
          className="w-40"
          value={value.from}
          aria-invalid={periodError ? true : undefined}
          aria-describedby={periodError ? "audit-to-error" : undefined}
          onChange={(event) => event.target.value && set({ from: event.target.value })}
        />
      </Field>
      <Field id="audit-to" label={t("filters.to")} error={periodError}>
        <Input
          id="audit-to"
          type="date"
          className="w-40"
          value={value.to}
          aria-invalid={periodError ? true : undefined}
          aria-describedby={periodError ? "audit-to-error" : undefined}
          onChange={(event) => event.target.value && set({ to: event.target.value })}
        />
      </Field>
      <Field id="audit-user" label={t("filters.user")} error={errors.user}>
        <Select value={value.user} onValueChange={(user) => set({ user })}>
          <SelectTrigger id="audit-user" className="min-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.allUsers")}</SelectItem>
            <SelectItem value={SYSTEM}>{t("filters.system")}</SelectItem>
            {options.users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.active ? user.name : t("actor.inactive", { name: user.name })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="audit-action" label={t("filters.action")} error={errors.action}>
        <Select value={value.action} onValueChange={(action) => set({ action })}>
          <SelectTrigger id="audit-action" className="min-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.allActions")}</SelectItem>
            {options.actions.map((action) => (
              <SelectItem key={action} value={action}>
                {t.has(`actions.${action}`) ? t(`actions.${action}`) : action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="audit-entity-type" label={t("filters.entityType")} error={errors.entityType}>
        <Select
          value={value.entityType}
          onValueChange={(entityType) =>
            set(entityType === ALL ? { entityType, entityId: "" } : { entityType })
          }
        >
          <SelectTrigger id="audit-entity-type" className="min-w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.allEntityTypes")}</SelectItem>
            {options.entityTypeGroups.map((group) => (
              <SelectGroup key={group.key}>
                <SelectLabel>{t(`entityGroups.${group.key}`)}</SelectLabel>
                {group.types.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t.has(`entityTypes.${type}`) ? t(`entityTypes.${type}`) : type}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        id="audit-entity-id"
        label={t("filters.entityId")}
        error={errors.entityId}
        hint={noType ? t("filters.entityIdHint") : undefined}
      >
        <Input
          id="audit-entity-id"
          className="w-80 max-w-full font-mono"
          value={entityId}
          disabled={noType}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={errors.entityId ? true : undefined}
          aria-describedby={errors.entityId ? "audit-entity-id-error" : undefined}
          onChange={(event) => {
            typed.current = true;
            setEntityId(event.target.value);
          }}
        />
      </Field>
      <div className="grid gap-2">
        {/* Keeps the button on the field row: the label row of the other fields. */}
        <span aria-hidden="true" className="h-4" />
        <Button type="button" variant="ghost" onClick={onClear}>
          {t("filters.clear")}
        </Button>
      </div>
    </div>
  );
}
