"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { PackageChoiceSlot } from "./appointment-panel";
import {
  QuickPatientForm,
  type ListItem,
  type SavePatientInput,
  type SavePatientResult,
} from "@/modules/patients/client";
import { toast } from "sonner";
import { useLocale } from "next-intl";
import { formatLocale, formatMoney } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/locales";
import type { CountryCode, Currency } from "@/shared/kernel/countries/codes";
import type { ActionResult } from "@/shared/kernel/action-result";
import type { PaletteColor } from "@/shared/kernel/palette";
import { Button } from "@/shared/ui/components/button";
import { Checkbox } from "@/shared/ui/components/checkbox";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/components/sheet";
import { Textarea } from "@/shared/ui/components/textarea";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { PALETTE } from "@/shared/ui/palette/palette";
import { cn } from "@/shared/ui/utils";
import type { BookResult } from "../application/book-appointment";
import type { BookingOptions } from "../application/booking-options";
import type { FindingDto } from "../application/booking";
import type { BookSeriesResult, SeriesPreview } from "../application/series";
import { formatMinute, parseTime } from "@/shared/kernel/calendar-date";
import { ConflictFindings, hasBlocking, needsOverbooking } from "./conflict-findings";
import { slotTimes, useAgendaFormat } from "./format";
import { PatientPicker } from "./patient-picker";
import { RecurrenceFields, recurrenceInput, type RecurrenceState } from "./recurrence-fields";
import { allResolved, SeriesConflicts, type Resolution } from "./series-conflicts";
import { useTranslations } from "next-intl";

export type ServiceOption = {
  id: string;
  name: string;
  categoryName: string;
  durationMinutes: number;
  prices: { currency: string; amountMinor: number }[];
  color: string;
};

// F05 quick registration inside the booking panel (PRD F06 Experience: "Novo paciente").
export type PatientFormData = {
  today: string;
  referralSources: ListItem[];
  tags: ListItem[];
  save: (input: SavePatientInput) => Promise<ActionResult<SavePatientResult>>;
};

export type BookingDraft = {
  date: string;
  startTime: string;
  professionalId?: string;
  roomId?: string;
  serviceId?: string;
};

export type BookingActions = {
  book: (input: unknown) => Promise<ActionResult<BookResult>>;
  previewSeries: (input: unknown) => Promise<ActionResult<SeriesPreview>>;
  bookSeries: (input: unknown) => Promise<ActionResult<BookSeriesResult>>;
  options: (input: { unitId: string; serviceId: string }) => Promise<ActionResult<BookingOptions>>;
};

const NO_ROOM = "__none__";

// Booking side panel (PRD F06 Experience, design system 10.2): patient → service → professional
// filtered by service → room filtered (auto-selected when only one) → date and time → optional
// recurrence. End time and price appear as soon as the service is chosen; conflicts are shown
// before saving.
export function BookingPanel({
  draft,
  unitId,
  currency,
  country,
  granularity,
  services,
  canRegisterPatient,
  patientForm,
  actions,
  packageSlot: PackageSlot,
  onClose,
  onBooked,
}: {
  draft: BookingDraft;
  unitId: string;
  // Currency and country of the unit: the price shown is the service price in that currency.
  currency: Currency;
  country: CountryCode;
  granularity: number;
  services: ServiceOption[];
  canRegisterPatient: boolean;
  patientForm: PatientFormData;
  actions: BookingActions;
  packageSlot?: PackageChoiceSlot | undefined;
  onClose: () => void;
  onBooked: () => void;
}) {
  const fmt = useAgendaFormat();
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [patient, setPatient] = useState<{ id: string; displayName: string } | null>(null);
  const [newPatient, setNewPatient] = useState(false);
  const [serviceId, setServiceId] = useState(draft.serviceId ?? "");
  const [options, setOptions] = useState<BookingOptions | null>(null);
  const [professionalId, setProfessionalId] = useState(draft.professionalId ?? "");
  const [roomId, setRoomId] = useState(draft.roomId ?? "");
  const [date, setDate] = useState(draft.date);
  const [startTime, setStartTime] = useState(draft.startTime);
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  // The package follows the patient, the service and the date; a change of any resets the choice.
  const [packageChoice, setPackageChoice] = useState<{ key: string; id: string | null }>({
    key: "",
    id: null,
  });
  const [repeat, setRepeat] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceState>({
    frequency: "WEEKLY",
    weekdays: [],
    endMode: "count",
    endsAfter: "10",
    endsOn: "",
  });
  const [findings, setFindings] = useState<FindingDto[]>([]);
  const [overbooking, setOverbooking] = useState(false);
  const [justification, setJustification] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [series, setSeries] = useState<SeriesPreview | null>(null);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);

  const locale = useLocale() as Locale;
  const priceText = (item: ServiceOption) => {
    const price = item.prices.find((entry) => entry.currency === currency);
    return price
      ? formatMoney({ amountMinor: price.amountMinor, currency }, formatLocale(locale, country))
      : "—";
  };
  const service = services.find((item) => item.id === serviceId);
  const grouped = useMemo(() => {
    const groups = new Map<string, ServiceOption[]>();
    for (const item of services)
      groups.set(item.categoryName, [...(groups.get(item.categoryName) ?? []), item]);
    return [...groups];
  }, [services]);

  // Service picked: load the professionals enabled for it and its rooms in the unit.
  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    void actions.options({ unitId, serviceId }).then((result) => {
      if (cancelled || !result.ok) return;
      setOptions(result.data);
      setProfessionalId((current) =>
        result.data.professionals.some((item) => item.id === current)
          ? current
          : (result.data.professionals[0]?.id ?? ""),
      );
      setRoomId((current) => {
        if (result.data.rooms.some((room) => room.id === current)) return current;
        return result.data.requiresRoom && result.data.rooms.length === 1
          ? (result.data.rooms[0]?.id ?? "")
          : "";
      });
    });
    return () => {
      cancelled = true;
    };
  }, [actions, serviceId, unitId]);

  const durationMinutes = Number(duration) || service?.durationMinutes || 0;
  const startMinute = parseTime(startTime);
  const endTime =
    startMinute !== null && durationMinutes ? formatMinute((startMinute + durationMinutes) % 1440) : null;

  // Conflict preview (advisory): shown inline before saving (PRD F06 Experience).
  useEffect(() => {
    if (!serviceId || !professionalId || !date || !startTime) return;
    const params = new URLSearchParams({ unitId, serviceId, professionalId, date, startTime });
    if (roomId) params.set("roomId", roomId);
    if (patient) params.set("patientId", patient.id);
    if (duration) params.set("durationMinutes", duration);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/schedule/conflicts?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { findings: FindingDto[] };
        setFindings(data.findings);
      } catch {
        // Aborted by a newer change.
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [unitId, serviceId, professionalId, roomId, date, startTime, duration, patient]);

  const packageKey = `${patient?.id ?? ""}|${serviceId}|${date}`;
  const packageId = packageChoice.key === packageKey ? packageChoice.id : null;

  const baseInput = () => ({
    ...(packageId ? { packageId } : {}),
    patientId: patient?.id,
    serviceId,
    professionalId,
    unitId,
    roomId: roomId || null,
    date,
    startTime,
    ...(duration ? { durationMinutes: Number(duration) } : {}),
    notes: notes || null,
    confirmOverbooking: overbooking,
    exceptionJustification: justification.trim() || null,
  });

  function fail(result: Extract<ActionResult<unknown>, { ok: false }>) {
    const details = result.error.details as { findings?: FindingDto[] } | undefined;
    if (details?.findings) setFindings(details.findings);
    if (result.error.code === "SCHEDULING_SERIES_CONFLICTS" && result.error.details) {
      setSeries(result.error.details as unknown as SeriesPreview);
      return;
    }
    if (result.error.fields) {
      setErrors(result.error.fields);
      if (result.error.code !== "VALIDATION_FAILED" && !details?.findings) {
        toast.error(result.error.message, { duration: Infinity, closeButton: true });
      }
      return;
    }
    if (!details?.findings) handleActionResult(result);
  }

  function submit() {
    setErrors({});
    if (!patient) {
      setErrors({ patientId: t("scheduling.ui.selectPatient") });
      return;
    }
    startTransition(async () => {
      if (!repeat) {
        const result = await actions.book(baseInput());
        if (!result.ok) return fail(result);
        toast.success(t("scheduling.ui.toasts.booked"));
        onBooked();
        return;
      }
      const input = { ...baseInput(), recurrence: recurrenceInput(recurrence), resolutions };
      if (!series) {
        const preview = await actions.previewSeries(input);
        if (!preview.ok) return fail(preview);
        if (preview.data.conflicts > 0) {
          setSeries(preview.data);
          return;
        }
      }
      const result = await actions.bookSeries(input);
      if (!result.ok) return fail(result);
      toast.success(t("scheduling.ui.toasts.seriesBooked", { count: result.data.appointmentIds.length }));
      onBooked();
    });
  }

  const blocked = hasBlocking(findings) && !repeat;
  const awaitingOverbooking = needsOverbooking(findings) && !overbooking && !repeat;
  const seriesPending = repeat && series !== null && !allResolved(series, resolutions);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("scheduling.ui.bookAppointment")}</SheetTitle>
          <SheetDescription>{fmt.longDate(date)}</SheetDescription>
        </SheetHeader>
        {/* The quick registration has its own form, so the patient block stays outside the booking form. */}
        <div className="grid gap-4 px-6">
          <Field id="booking-patient" label={t("common.patient")} error={errors.patientId}>
            {newPatient ? (
              <div className="grid gap-2 rounded-md border p-3">
                <QuickPatientForm
                  defaultCountry={country}
                  today={patientForm.today}
                  referralSources={patientForm.referralSources}
                  tags={patientForm.tags}
                  actions={{ save: patientForm.save }}
                  onCreated={(id, displayName) => {
                    setPatient({ id, displayName });
                    setNewPatient(false);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => setNewPatient(false)}
                >
                  {t("scheduling.ui.backToSearch")}
                </Button>
              </div>
            ) : (
              <PatientPicker
                id="booking-patient"
                value={patient}
                onChange={setPatient}
                onNewPatient={() => setNewPatient(true)}
                canRegister={canRegisterPatient}
                error={errors.patientId}
              />
            )}
          </Field>
        </div>
        <form
          className="grid gap-4 px-6"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field id="booking-service" label={t("common.service")} error={errors.serviceId}>
            <Select
              value={serviceId}
              onValueChange={(value) => {
                setServiceId(value);
                setDuration("");
                setFindings([]);
              }}
            >
              <SelectTrigger id="booking-service" className="w-full">
                <SelectValue placeholder={t("scheduling.ui.chooseService")} />
              </SelectTrigger>
              <SelectContent>
                {grouped.map(([category, items]) => (
                  <SelectGroup key={category}>
                    <SelectLabel>{category}</SelectLabel>
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <span
                          aria-hidden
                          className={cn(
                            "size-3 rounded-full",
                            PALETTE[(item.color in PALETTE ? item.color : "slate") as PaletteColor].swatch,
                          )}
                        />
                        {t("scheduling.ui.serviceOption", {
                          name: item.name,
                          minutes: item.durationMinutes,
                          price: priceText(item),
                        })}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="booking-professional" label={t("common.professional")} error={errors.professionalId}>
            <Select value={professionalId} onValueChange={setProfessionalId} disabled={!options}>
              <SelectTrigger id="booking-professional" className="w-full">
                <SelectValue
                  placeholder={
                    serviceId ? t("scheduling.ui.chooseProfessional") : t("scheduling.ui.chooseServiceFirst")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(options?.professionals ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span
                      aria-hidden
                      className={cn(
                        "size-3 rounded-full",
                        PALETTE[(item.color in PALETTE ? item.color : "slate") as PaletteColor].swatch,
                      )}
                    />
                    {item.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {options && options.professionals.length === 0 ? (
              <p className="text-muted-foreground text-xs">{t("scheduling.ui.noProfessionalForService")}</p>
            ) : null}
          </Field>

          {options && (options.requiresRoom || options.rooms.length > 0) ? (
            <Field
              id="booking-room"
              label={options.requiresRoom ? t("common.room") : t("scheduling.ui.roomOptional")}
              error={errors.roomId}
            >
              <Select
                value={roomId || NO_ROOM}
                onValueChange={(value) => setRoomId(value === NO_ROOM ? "" : value)}
              >
                <SelectTrigger id="booking-room" className="w-full">
                  <SelectValue placeholder={t("scheduling.ui.chooseRoom")} />
                </SelectTrigger>
                <SelectContent>
                  {!options.requiresRoom ? (
                    <SelectItem value={NO_ROOM}>{t("scheduling.ui.noRoom")}</SelectItem>
                  ) : null}
                  {options.rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="booking-date" label={t("common.date")} error={errors.date}>
              <Input
                id="booking-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field id="booking-time" label={t("professionals.ui.scheduleSingular")} error={errors.startTime}>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger id="booking-time" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {slotTimes(granularity).map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              id="booking-duration"
              label={t("scheduling.ui.durationMinutes")}
              error={errors.durationMinutes}
            >
              <Input
                id="booking-duration"
                type="number"
                min={5}
                max={480}
                step={5}
                placeholder={service ? String(service.durationMinutes) : ""}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </Field>
          </div>
          {service ? (
            <p className="text-muted-foreground text-sm tabular-nums">
              {startTime}–{endTime} · {priceText(service)}
            </p>
          ) : null}

          {PackageSlot && patient && serviceId ? (
            <PackageSlot
              patientId={patient.id}
              serviceId={serviceId}
              date={date}
              value={packageId}
              onChange={(id) => setPackageChoice({ key: packageKey, id })}
              seriesCount={repeat ? (series?.total ?? null) : null}
            />
          ) : null}

          <Field id="booking-notes" label={t("scheduling.ui.notesForFrontDesk")} error={errors.notes}>
            <Textarea
              id="booking-notes"
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={repeat}
              onCheckedChange={(checked) => {
                setRepeat(checked === true);
                setSeries(null);
                setResolutions([]);
              }}
            />
            {t("scheduling.ui.repeatAppointment")}
          </label>
          {repeat ? (
            <RecurrenceFields
              value={recurrence}
              onChange={(value) => {
                setRecurrence(value);
                setSeries(null);
                setResolutions([]);
              }}
              errors={errors}
            />
          ) : null}

          {repeat && series ? (
            <SeriesConflicts
              preview={series}
              resolutions={resolutions}
              onResolve={setResolutions}
              granularity={granularity}
            />
          ) : (
            <ConflictFindings
              findings={findings}
              overbookingConfirmed={overbooking}
              onConfirmOverbooking={() => setOverbooking(true)}
              justification={justification}
              onJustification={setJustification}
              justificationError={errors.exceptionJustification}
            />
          )}
          <SheetFooter className="bg-popover sticky bottom-0 border-t px-0">
            <Button
              type="submit"
              disabled={pending || blocked || awaitingOverbooking || seriesPending || newPatient}
            >
              {pending
                ? t("scheduling.ui.booking")
                : repeat && series
                  ? t("scheduling.ui.bookSessions")
                  : t("scheduling.ui.book")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
