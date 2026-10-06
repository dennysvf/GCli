"use client";

import { useDndMonitor, useDraggable } from "@dnd-kit/core";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { PaletteColor } from "@/shared/kernel/palette";
import { Stamp } from "@/shared/ui/components/stamp";
import { PALETTE } from "@/shared/ui/palette/palette";
import { cn } from "@/shared/ui/utils";
import type { AgendaItem } from "../application/queries";
import { latenessMinutes } from "../domain/agenda-time";
import { DURATION_MAX, DURATION_MIN, DURATION_STEP } from "../domain/limits";
import { STATUS_STAMPS, useAgendaFormat } from "./format";
import { useTranslations } from "next-intl";

// Agenda block (design system 10.1, 5.11): a paper card with a 4 px stripe in the service color,
// the patient's name, service and room, and the status written as a stamp. Short blocks show only
// the name and the stamp.

export const PX_PER_MINUTE = 32 / 15;

const snap = (minutes: number) =>
  Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(minutes / DURATION_STEP) * DURATION_STEP));

export function AppointmentBlock({
  item,
  timeZone,
  top,
  left,
  width,
  now,
  draggable,
  onOpen,
  onResize,
  onKeyMove,
}: {
  item: AgendaItem;
  timeZone: string;
  top: number;
  left: string;
  width: string;
  now: Date;
  draggable: boolean;
  onOpen: (item: AgendaItem) => void;
  onResize: (item: AgendaItem, durationMinutes: number) => void;
  onKeyMove: (item: AgendaItem, event: KeyboardEvent<HTMLElement>) => void;
}) {
  const fmt = useAgendaFormat();
  const t = useTranslations();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item },
    disabled: !draggable,
  });
  const [preview, setPreview] = useState<number | null>(null);
  // The key or pointer release that ends a drag must not also open the panel.
  const lastDrag = useRef(0);
  useDndMonitor({
    onDragStart: () => {
      lastDrag.current = Date.now();
    },
    onDragEnd: () => {
      lastDrag.current = Date.now();
    },
    onDragCancel: () => {
      lastDrag.current = Date.now();
    },
  });
  const duration = preview ?? item.durationMinutes;
  const height = Math.max(duration * PX_PER_MINUTE - 2, 18);
  const short = item.durationMinutes <= 20;
  const late = latenessMinutes(item.status, new Date(item.startsAt), now);
  const color = (item.service.color in PALETTE ? item.service.color : "slate") as PaletteColor;

  function startResize(event: PointerEvent<HTMLSpanElement>) {
    event.stopPropagation();
    event.preventDefault();
    const startY = event.clientY;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: globalThis.PointerEvent) =>
      setPreview(snap(item.durationMinutes + (moveEvent.clientY - startY) / PX_PER_MINUTE));
    const up = (upEvent: globalThis.PointerEvent) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      const next = snap(item.durationMinutes + (upEvent.clientY - startY) / PX_PER_MINUTE);
      setPreview(null);
      if (next !== item.durationMinutes) onResize(item, next);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  function resizeKeys(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setPreview(snap(duration + (event.key === "ArrowDown" ? DURATION_STEP : -DURATION_STEP)));
    } else if (event.key === "Enter" && preview !== null) {
      event.preventDefault();
      event.stopPropagation();
      setPreview(null);
      if (preview !== item.durationMinutes) onResize(item, preview);
    } else if (event.key === "Escape") {
      setPreview(null);
    }
  }

  const label = `${item.patient.displayName}, ${item.service.name}, ${fmt.timeRange(item.startsAt, item.endsAt, timeZone)}, ${fmt.statusText(item.status).toLowerCase()}`;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "bg-paper-0 absolute overflow-hidden rounded-sm border text-left",
        item.status === "CANCELLED" && "opacity-60",
        isDragging && "shadow-floating z-30 opacity-90",
      )}
      style={{
        top,
        left,
        width,
        height,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", PALETTE[color].swatch)} />
      <button
        type="button"
        className={cn(
          "focus-visible:ring-ring flex h-full w-full flex-col gap-0.5 py-1 pr-1.5 pl-2.5 text-left outline-none focus-visible:ring-2",
          draggable && "cursor-grab active:cursor-grabbing",
        )}
        aria-label={label}
        onClick={() => {
          if (Date.now() - lastDrag.current > 400) onOpen(item);
        }}
        {...(draggable ? listeners : {})}
        {...(draggable ? attributes : {})}
        onKeyDown={(event) => onKeyMove(item, event)}
        // Space on a button clicks on key release; the keyboard move owns Space.
        onKeyUp={(event) => {
          if (draggable && event.key === " ") event.preventDefault();
        }}
      >
        <span className="truncate text-xs font-semibold">{item.patient.displayName}</span>
        {!short ? (
          <span className="text-muted-foreground truncate text-xs">
            {item.service.name}
            {item.room ? ` · ${item.room.name}` : ""}
          </span>
        ) : null}
        <span className="flex flex-wrap items-center gap-1">
          <Stamp variant={STATUS_STAMPS[item.status]}>{fmt.statusText(item.status)}</Stamp>
          {item.isOverbooking ? <Stamp variant="warning">{t("scheduling.ui.overbookingTag")}</Stamp> : null}
          {late !== null ? (
            <span className="text-terracotta-text text-xs">{t("scheduling.ui.late", { minutes: late })}</span>
          ) : null}
        </span>
      </button>
      {draggable ? (
        <span
          role="slider"
          tabIndex={0}
          aria-label={t("scheduling.ui.durationOf", { patient: item.patient.displayName })}
          aria-valuemin={DURATION_MIN}
          aria-valuemax={DURATION_MAX}
          aria-valuenow={duration}
          aria-valuetext={t("scheduling.ui.durationValue", { minutes: duration })}
          className="hover:bg-rule-strong focus-visible:bg-rule-strong absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize outline-none"
          onPointerDown={startResize}
          onKeyDown={resizeKeys}
        />
      ) : null}
    </div>
  );
}
