"use client";

import { useEffect, useState, useTransition } from "react";
import { formatMinute } from "@/shared/kernel/calendar-date";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Textarea } from "@/shared/ui/components/textarea";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { BookingOptions } from "../application/booking-options";
import type { FindingDto } from "../application/booking";
import type { AppointmentDetails } from "../application/queries";
import type { SeriesPreview } from "../application/series";
import type { AppointmentActions } from "./appointment-panel";
import type { ServiceOption } from "./booking-panel";
import { ConflictFindings, hasBlocking, needsOverbooking } from "./conflict-findings";
import { localParts, slotTimes } from "./format";
import { allResolved, SeriesConflicts, type Resolution } from "./series-conflicts";
import type { SeriesScope } from "./series-scope-dialog";
import { useTranslations } from "next-intl";

export type ChangeKind = "reschedule" | "edit";

const NO_ROOM = "__none__";

// Rescheduling and editing from the side panel (PRD F06). For a series with "Este e os seguintes"
// or "Todos os futuros", the same fields apply to every reached session, which are checked first
// and listed with their conflicts (spec F06: the series is split).
export function ChangeForm({
  details,
  change,
  scope,
  granularity,
  services,
  actions,
  onSaved,
  onBack,
}: {
  details: AppointmentDetails;
  change: ChangeKind;
  scope: SeriesScope;
  granularity: number;
  services: ServiceOption[];
  actions: AppointmentActions;
  onSaved: () => void;
  onBack: () => void;
}) {
  const t = useTranslations();
  const zone = details.unitTimeZone;
  const local = localParts(details.startsAt, zone);
  const series = scope !== "THIS";
  const [date, setDate] = useState(local.date);
  const [startTime, setStartTime] = useState(formatMinute(local.minute));
  const [serviceId, setServiceId] = useState(details.service.id);
  const [professionalId, setProfessionalId] = useState(details.professional.id);
  const [roomId, setRoomId] = useState(details.room?.id ?? "");
  const [duration, setDuration] = useState(String(details.durationMinutes));
  const [notes, setNotes] = useState(details.notes ?? "");
  const [options, setOptions] = useState<BookingOptions | null>(null);
  const [findings, setFindings] = useState<FindingDto[]>([]);
  const [overbooking, setOverbooking] = useState(false);
  const [justification, setJustification] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<SeriesPreview | null>(null);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void actions.options({ unitId: details.unitId, serviceId }).then((result) => {
      if (!cancelled && result.ok) setOptions(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [actions, details.unitId, serviceId]);

  // Conflict preview of a single change (series changes are checked by "Revisar sessões").
  useEffect(() => {
    if (series) return;
    const params = new URLSearchParams({
      appointmentId: details.id,
      patientId: details.patient.id,
      unitId: details.unitId,
      serviceId,
      professionalId,
      date,
      startTime,
      durationMinutes: duration,
    });
    if (roomId) params.set("roomId", roomId);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/schedule/conflicts?${params.toString()}`, {
          signal: controller.signal,
        });
        if (response.ok) setFindings(((await response.json()) as { findings: FindingDto[] }).findings);
      } catch {
        // Aborted by a newer change.
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [series, details, serviceId, professionalId, roomId, date, startTime, duration]);

  const overrides = () => ({
    confirmOverbooking: overbooking,
    exceptionJustification: justification.trim() || null,
  });

  function failed(result: {
    ok: false;
    error: {
      code: string;
      fields?: Record<string, string>;
      details?: Record<string, unknown>;
      message: string;
    };
  }) {
    const extra = result.error.details as { findings?: FindingDto[] } | undefined;
    if (result.error.code === "SCHEDULING_SERIES_CONFLICTS" && result.error.details) {
      setPreview(result.error.details as unknown as SeriesPreview);
      return;
    }
    if (extra?.findings) {
      setFindings(extra.findings);
      return;
    }
    if (result.error.fields) {
      setErrors(result.error.fields);
      return;
    }
    handleActionResult(result);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      if (series) {
        const input = {
          appointmentId: details.id,
          scope,
          changes: {
            ...(startTime !== formatMinute(local.minute) ? { startTime } : {}),
            ...(professionalId !== details.professional.id ? { professionalId } : {}),
            ...(roomId !== (details.room?.id ?? "") ? { roomId: roomId || null } : {}),
            ...(Number(duration) !== details.durationMinutes ? { durationMinutes: Number(duration) } : {}),
            ...((notes || null) !== details.notes ? { notes: notes || null } : {}),
          },
          resolutions,
          ...overrides(),
        };
        if (!preview) {
          const checked = await actions.previewSeriesEdit(input);
          if (!checked.ok) return failed(checked);
          if (checked.data.conflicts > 0) {
            setPreview(checked.data);
            return;
          }
        }
        const result = await actions.editSeries(input);
        if (!result.ok) return failed(result);
        onSaved();
        return;
      }
      const result =
        change === "reschedule"
          ? await actions.reschedule({
              appointmentId: details.id,
              version: details.version,
              date,
              startTime,
              professionalId,
              roomId: roomId || null,
              source: "FORM",
              ...overrides(),
            })
          : await actions.update({
              appointmentId: details.id,
              version: details.version,
              ...(serviceId !== details.service.id ? { serviceId } : {}),
              durationMinutes: Number(duration),
              roomId: roomId || null,
              notes: notes || null,
              ...overrides(),
            });
      if (!result.ok) return failed(result);
      onSaved();
    });
  }

  const showsTime = change === "reschedule";
  const blocked = !series && hasBlocking(findings);
  const awaiting = !series && needsOverbooking(findings) && !overbooking;

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h3 className="section-title">
        {change === "reschedule" ? t("common.reschedule") : t("scheduling.ui.editAppointment")}
        {series
          ? scope === "THIS_AND_FOLLOWING"
            ? t("scheduling.ui.scopeFollowingSuffix")
            : t("scheduling.ui.scopeAllSuffix")
          : ""}
      </h3>
      {change === "edit" && !series ? (
        <Field id="change-service" label={t("common.service")} error={errors.serviceId}>
          <Select value={serviceId} onValueChange={setServiceId}>
            <SelectTrigger id="change-service" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {services.map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {showsTime ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {!series ? (
            <Field id="change-date" label={t("common.date")} error={errors.date}>
              <Input
                id="change-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
          ) : null}
          <Field id="change-time" label={t("professionals.ui.scheduleSingular")} error={errors.startTime}>
            <Select
              value={startTime}
              onValueChange={(value) => {
                setStartTime(value);
                setPreview(null);
              }}
            >
              <SelectTrigger id="change-time" className="w-full">
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
        </div>
      ) : null}
      {showsTime || series ? (
        <Field id="change-professional" label={t("common.professional")} error={errors.professionalId}>
          <Select
            value={professionalId}
            onValueChange={(value) => {
              setProfessionalId(value);
              setPreview(null);
            }}
          >
            <SelectTrigger id="change-professional" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                options?.professionals ?? [
                  { id: details.professional.id, displayName: details.professional.displayName },
                ]
              ).map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {options && (options.requiresRoom || options.rooms.length > 0) ? (
        <Field
          id="change-room"
          label={options.requiresRoom ? t("common.room") : t("scheduling.ui.roomOptional")}
          error={errors.roomId}
        >
          <Select
            value={roomId || NO_ROOM}
            onValueChange={(value) => {
              setRoomId(value === NO_ROOM ? "" : value);
              setPreview(null);
            }}
          >
            <SelectTrigger id="change-room" className="w-full">
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
      {change === "edit" ? (
        <>
          <Field
            id="change-duration"
            label={t("scheduling.ui.durationMinutes")}
            error={errors.durationMinutes}
          >
            <Input
              id="change-duration"
              type="number"
              min={5}
              max={480}
              step={5}
              value={duration}
              onChange={(event) => {
                setDuration(event.target.value);
                setPreview(null);
              }}
            />
          </Field>
          <Field id="change-notes" label={t("scheduling.ui.notesForFrontDesk")} error={errors.notes}>
            <Textarea
              id="change-notes"
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </>
      ) : null}

      {series && preview ? (
        <SeriesConflicts
          preview={preview}
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
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button
          type="submit"
          disabled={
            pending ||
            blocked ||
            awaiting ||
            (series && preview !== null && !allResolved(preview, resolutions))
          }
        >
          {pending
            ? t("common.saving")
            : series && !preview
              ? t("scheduling.ui.reviewSessions")
              : change === "reschedule"
                ? t("common.reschedule")
                : t("common.saveChanges")}
        </Button>
      </div>
    </form>
  );
}
