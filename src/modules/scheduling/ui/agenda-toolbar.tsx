"use client";

import { ChevronLeft, ChevronRight, Filter, Printer, Search } from "lucide-react";
import { Button } from "@/shared/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/components/dropdown-menu";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/components/tabs";
import { APPOINTMENT_STATUSES, type AppointmentStatus } from "../domain/status";
import { useTranslations } from "next-intl";

export type AgendaViewKind = "day" | "week" | "list";
export type AgendaBy = "professional" | "room";

export type ToolbarState = {
  view: AgendaViewKind;
  by: AgendaBy;
  date: string;
  focusId: string;
  professionalIds: string[];
  serviceIds: string[];
  statuses: AppointmentStatus[];
};

// Agenda toolbar (design system 10.1): ‹ Hoje ›, date, Dia/Semana/Lista, Profissionais/Salas and the
// filters of PRD F06 (professionals, services, statuses), plus "Próximo horário livre" and the
// printed agenda.
export function AgendaToolbar({
  state,
  onChange,
  onStep,
  onToday,
  professionals,
  rooms,
  services,
  ownOnly,
  canManage,
  onAvailability,
  pdfHref,
}: {
  state: ToolbarState;
  onChange: (next: Partial<ToolbarState>) => void;
  onStep: (direction: -1 | 1) => void;
  onToday: () => void;
  professionals: { id: string; label: string }[];
  rooms: { id: string; label: string }[];
  services: { id: string; name: string }[];
  ownOnly: boolean;
  canManage: boolean;
  onAvailability: () => void;
  pdfHref: (professionalId: string) => string;
}) {
  const t = useTranslations();
  const toggle = <T extends string>(list: T[], value: T, checked: boolean) =>
    checked ? [...list, value] : list.filter((item) => item !== value);
  const filterCount = state.professionalIds.length + state.serviceIds.length + state.statuses.length;
  const focusList = state.by === "room" ? rooms : professionals;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("common.previous")}
          onClick={() => onStep(-1)}
        >
          <ChevronLeft />
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onToday}>
          {t("common.today")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("common.nextMasculine")}
          onClick={() => onStep(1)}
        >
          <ChevronRight />
        </Button>
        <Input
          type="date"
          aria-label={t("common.date")}
          className="h-8 w-40"
          value={state.date}
          onChange={(event) => event.target.value && onChange({ date: event.target.value })}
        />
      </div>
      <Tabs value={state.view} onValueChange={(view) => onChange({ view: view as AgendaViewKind })}>
        <TabsList>
          <TabsTrigger value="day">{t("scheduling.ui.viewDay")}</TabsTrigger>
          <TabsTrigger value="week">{t("scheduling.ui.viewWeek")}</TabsTrigger>
          <TabsTrigger value="list">{t("scheduling.ui.viewList")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {!ownOnly && state.view !== "list" ? (
        <Tabs value={state.by} onValueChange={(by) => onChange({ by: by as AgendaBy, focusId: "" })}>
          <TabsList>
            <TabsTrigger value="professional">{t("common.professionals")}</TabsTrigger>
            <TabsTrigger value="room">{t("common.rooms")}</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {state.view === "week" && !ownOnly && focusList.length > 0 ? (
        <Select value={state.focusId || focusList[0]?.id} onValueChange={(focusId) => onChange({ focusId })}>
          <SelectTrigger
            size="sm"
            aria-label={
              state.by === "room" ? t("scheduling.ui.weekRoom") : t("scheduling.ui.weekProfessional")
            }
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {focusList.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            <Filter />
            {t("scheduling.ui.filters")}
            {filterCount > 0 ? ` (${filterCount})` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
          {!ownOnly ? (
            <>
              <DropdownMenuLabel>{t("common.professionals")}</DropdownMenuLabel>
              {professionals.map((item) => (
                <DropdownMenuCheckboxItem
                  key={item.id}
                  checked={state.professionalIds.includes(item.id)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) =>
                    onChange({ professionalIds: toggle(state.professionalIds, item.id, checked === true) })
                  }
                >
                  {item.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuLabel>{t("common.services")}</DropdownMenuLabel>
          {services.map((item) => (
            <DropdownMenuCheckboxItem
              key={item.id}
              checked={state.serviceIds.includes(item.id)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                onChange({ serviceIds: toggle(state.serviceIds, item.id, checked === true) })
              }
            >
              {item.name}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("common.status")}</DropdownMenuLabel>
          {APPOINTMENT_STATUSES.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={state.statuses.includes(status)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                onChange({ statuses: toggle(state.statuses, status, checked === true) })
              }
            >
              {t(`scheduling.ui.status.${status}`)}
            </DropdownMenuCheckboxItem>
          ))}
          {filterCount > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onChange({ professionalIds: [], serviceIds: [], statuses: [] })}
              >
                {t("scheduling.ui.clearFilters")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {canManage ? (
        <Button type="button" variant="ghost" size="sm" onClick={onAvailability}>
          <Search />
          {t("scheduling.ui.nextFreeSlot")}
        </Button>
      ) : null}
      {professionals.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              <Printer />
              {t("scheduling.ui.printAgenda")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t("scheduling.ui.dayAgendaOf")}</DropdownMenuLabel>
            {professionals.map((item) => (
              <DropdownMenuItem key={item.id} asChild>
                <a href={pdfHref(item.id)} target="_blank" rel="noopener">
                  {item.label}
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
