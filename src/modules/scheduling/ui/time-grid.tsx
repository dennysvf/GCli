"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useRef, useState, type KeyboardEvent } from "react";
import type { PaletteColor } from "@/shared/kernel/palette";
import { PALETTE } from "@/shared/ui/palette/palette";
import { cn } from "@/shared/ui/utils";
import type { AgendaItem } from "../application/queries";
import { isOpen } from "../domain/status";
import { AppointmentBlock, PX_PER_MINUTE } from "./appointment-block";
import { localParts, useAgendaFormat } from "./format";
import { useTranslations } from "next-intl";

// Day and Week grids (design system 10.1 and 5.11): a time ruler on the left and one column per
// professional, room or day. Empty slots are buttons that start a booking; blocks can be dragged
// to another slot or column (dnd-kit for pointer and touch, ADR-025) or moved with the keyboard
// (Space picks up, arrows move one slot or one column, Space drops, Esc cancels), and resized
// from their bottom edge.

export type KeyboardMove = { itemId: string; column: number; minute: number; duration: number };

export type GridColumn = {
  key: string;
  label: string;
  sublabel?: string;
  color?: string | null;
  date: string;
  professionalId?: string;
  roomId?: string;
  // Minutes from local midnight.
  workingIntervals: { start: number; end: number }[] | null;
  unitIntervals: { start: number; end: number }[];
  closure: string | null;
  isToday: boolean;
};

type Placed = { item: AgendaItem; start: number; lane: number; lanes: number };

// Side by side lanes for overlapping blocks of one column (design system 5.11: Encaixe).
function place(items: AgendaItem[], timeZone: string): Placed[] {
  const sorted = items
    .map((item) => ({ item, start: localParts(item.startsAt, timeZone).minute }))
    .sort((a, b) => a.start - b.start);
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const lanesEnd: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((entry) => entry.lane + 1));
    for (const entry of cluster) entry.lanes = lanes;
    placed.push(...cluster);
    cluster = [];
    lanesEnd.length = 0;
  };
  for (const entry of sorted) {
    const end = entry.start + entry.item.durationMinutes;
    if (entry.start >= clusterEnd && cluster.length > 0) flush();
    let lane = lanesEnd.findIndex((laneEnd) => laneEnd <= entry.start);
    if (lane < 0) lane = lanesEnd.length;
    lanesEnd[lane] = end;
    cluster.push({ ...entry, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) flush();
  return placed;
}

function Column({
  column,
  items,
  rulerStart,
  rulerEnd,
  granularity,
  timeZone,
  now,
  canBook,
  canDrag,
  showNowLabel,
  moving,
  onBlockKey,
  onSlot,
  onOpen,
  onResize,
}: {
  column: GridColumn;
  items: AgendaItem[];
  rulerStart: number;
  rulerEnd: number;
  granularity: number;
  timeZone: string;
  now: Date;
  canBook: boolean;
  canDrag: boolean;
  showNowLabel: boolean;
  // The keyboard move target when it is in this column.
  moving: KeyboardMove | null;
  onBlockKey: (item: AgendaItem, event: KeyboardEvent<HTMLElement>) => void;
  onSlot: (column: GridColumn, minute: number) => void;
  onOpen: (item: AgendaItem) => void;
  onResize: (item: AgendaItem, durationMinutes: number) => void;
}) {
  const fmt = useAgendaFormat();
  const t = useTranslations();
  const { setNodeRef, isOver } = useDroppable({ id: column.key, data: { column } });
  const height = (rulerEnd - rulerStart) * PX_PER_MINUTE;
  const y = (minute: number) => (minute - rulerStart) * PX_PER_MINUTE;
  const open = column.workingIntervals ?? column.unitIntervals;
  const slots: number[] = [];
  for (let minute = rulerStart; minute < rulerEnd; minute += granularity) slots.push(minute);
  const nowParts = localParts(now.toISOString(), timeZone);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "bg-paper-1 relative min-w-[180px] flex-1 border-l",
        isOver && "outline-ink-blue outline-2 outline-dashed",
      )}
      style={{ height }}
    >
      {open.map((interval) => (
        <div
          key={`${interval.start}-${interval.end}`}
          aria-hidden
          className="bg-paper-0 absolute inset-x-0"
          style={{
            top: y(Math.max(interval.start, rulerStart)),
            height: (Math.min(interval.end, rulerEnd) - Math.max(interval.start, rulerStart)) * PX_PER_MINUTE,
          }}
        />
      ))}
      {slots.map((minute) => (
        <div
          key={minute}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0",
            minute % 60 === 0 ? "border-t" : minute % 30 === 0 ? "border-t border-dashed" : "",
          )}
          style={{ top: y(minute) }}
        />
      ))}
      {column.closure ? (
        <div
          className="bg-paper-2 text-muted-foreground absolute inset-0 flex items-start justify-center p-2 text-xs"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg, transparent 0 6px, var(--rule) 6px 7px)",
          }}
        >
          <span className="bg-paper-2 px-1">
            {t("scheduling.ui.unitClosedColon")} {column.closure}
          </span>
        </div>
      ) : null}
      {canBook && !column.closure
        ? slots.map((minute) => (
            <button
              key={`slot-${minute}`}
              type="button"
              className="hover:bg-ink-blue-soft focus-visible:bg-ink-blue-soft absolute inset-x-0 outline-none"
              style={{ top: y(minute), height: granularity * PX_PER_MINUTE }}
              aria-label={t("scheduling.ui.slotLabel", { time: fmt.minute(minute), column: column.label })}
              onClick={() => onSlot(column, minute)}
              onKeyDown={(event) => {
                if (event.key.toLowerCase() === "n") {
                  event.preventDefault();
                  onSlot(column, minute);
                }
              }}
            />
          ))
        : null}
      {place(items, timeZone).map(({ item, start, lane, lanes }) => (
        <AppointmentBlock
          key={item.id}
          item={item}
          timeZone={timeZone}
          top={y(start) + 1}
          left={`calc(${(lane / lanes) * 100}% + 2px)`}
          width={`calc(${100 / lanes}% - 4px)`}
          now={now}
          draggable={canDrag && isOpen(item.status)}
          onOpen={onOpen}
          onResize={onResize}
          onKeyMove={onBlockKey}
        />
      ))}
      {moving ? (
        <div
          aria-hidden
          className="outline-ink-blue pointer-events-none absolute inset-x-1 z-30 rounded-sm outline-2 outline-dashed"
          style={{ top: y(moving.minute), height: moving.duration * PX_PER_MINUTE }}
        />
      ) : null}
      {column.isToday && nowParts.minute >= rulerStart && nowParts.minute <= rulerEnd ? (
        <div
          aria-hidden
          className="bg-terracotta pointer-events-none absolute inset-x-0 z-20 h-0.5"
          style={{ top: y(nowParts.minute) }}
        >
          {/* Design system 10.1: the "now" label, the only terracotta text on the screen. */}
          {showNowLabel ? (
            <span className="text-terracotta-text bg-paper-0 absolute -top-2.5 left-1 px-1 text-xs tabular-nums">
              {t("scheduling.ui.now")} {fmt.minute(nowParts.minute)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TimeGrid({
  columns,
  items,
  columnOf,
  timeZone,
  granularity,
  now,
  canBook,
  canDrag,
  onSlot,
  onOpen,
  onMove,
  onResize,
}: {
  columns: GridColumn[];
  items: AgendaItem[];
  columnOf: (item: AgendaItem) => string | null;
  timeZone: string;
  granularity: number;
  now: Date;
  canBook: boolean;
  canDrag: boolean;
  onSlot: (column: GridColumn, minute: number) => void;
  onOpen: (item: AgendaItem) => void;
  onMove: (item: AgendaItem, column: GridColumn, minute: number) => void;
  onResize: (item: AgendaItem, durationMinutes: number) => void;
}) {
  const fmt = useAgendaFormat();
  const t = useTranslations();
  const bounds = columns.flatMap((column) => [...column.unitIntervals, ...(column.workingIntervals ?? [])]);
  const itemBounds = items.map((item) => {
    const start = localParts(item.startsAt, timeZone).minute;
    return { start, end: start + item.durationMinutes };
  });
  const all = [...bounds, ...itemBounds];
  const rulerStart = Math.floor(Math.min(7 * 60, ...all.map((entry) => entry.start)) / 60) * 60;
  const rulerEnd = Math.min(1440, Math.ceil(Math.max(19 * 60, ...all.map((entry) => entry.end)) / 60) * 60);
  const hours: number[] = [];
  for (let minute = rulerStart; minute < rulerEnd; minute += 60) hours.push(minute);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  // Keyboard move (design system 5.11): Space picks up, arrows move one slot up or down or one
  // column sideways, Space or Enter drops (and opens the confirmation), Esc cancels. Implemented
  // here because a keyboard sensor scrolls the page instead of moving the block (ADR-025).
  const [moving, setMoving] = useState<KeyboardMove | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const lastKeyMove = useRef(0);
  const describe = (move: KeyboardMove) => `${columns[move.column]?.label ?? ""}, ${fmt.minute(move.minute)}`;

  function onBlockKey(item: AgendaItem, event: KeyboardEvent<HTMLElement>) {
    if (!canDrag || !isOpen(item.status)) return;
    const key = event.key;
    if (!moving) {
      if (key !== " ") return;
      event.preventDefault();
      const column = columns.findIndex((entry) => entry.key === columnOf(item));
      if (column < 0) return;
      const picked = {
        itemId: item.id,
        column,
        minute: localParts(item.startsAt, timeZone).minute,
        duration: item.durationMinutes,
      };
      lastKeyMove.current = Date.now();
      setMoving(picked);
      setAnnouncement(
        t("scheduling.ui.dragPickedFor", { patient: item.patient.displayName, where: describe(picked) }),
      );
      return;
    }
    if (moving.itemId !== item.id) return;
    if (key === "Escape") {
      event.preventDefault();
      setMoving(null);
      setAnnouncement(t("scheduling.ui.dragCancelled"));
      return;
    }
    if (key === " " || key === "Enter") {
      event.preventDefault();
      lastKeyMove.current = Date.now();
      setMoving(null);
      const column = columns[moving.column];
      const start = localParts(item.startsAt, timeZone).minute;
      if (!column || (moving.minute === start && column.key === columnOf(item))) {
        setAnnouncement(t("scheduling.ui.dragSameTime"));
        return;
      }
      setAnnouncement(t("scheduling.ui.dragDropped"));
      onMove(item, column, moving.minute);
      return;
    }
    const steps: Record<string, Partial<KeyboardMove>> = {
      ArrowDown: { minute: Math.min(1440 - granularity, moving.minute + granularity) },
      ArrowUp: { minute: Math.max(0, moving.minute - granularity) },
      ArrowRight: { column: Math.min(columns.length - 1, moving.column + 1) },
      ArrowLeft: { column: Math.max(0, moving.column - 1) },
    };
    const step = steps[key];
    if (!step) return;
    event.preventDefault();
    const next = { ...moving, ...step };
    setMoving(next);
    setAnnouncement(describe(next));
  }

  const openBlock = (item: AgendaItem) => {
    if (moving || Date.now() - lastKeyMove.current < 400) return;
    onOpen(item);
  };

  function onDragEnd(event: DragEndEvent) {
    const item = event.active.data.current?.item as AgendaItem | undefined;
    const column = event.over?.data.current?.column as GridColumn | undefined;
    if (!item || !column) return;
    const start = localParts(item.startsAt, timeZone).minute;
    const moved = Math.round(event.delta.y / PX_PER_MINUTE / granularity) * granularity;
    const minute = Math.max(0, Math.min(1440 - granularity, start + moved));
    if (minute === start && column.key === columnOf(item)) return;
    onMove(item, column, minute);
  }

  const byColumn = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const key = columnOf(item);
    if (key) byColumn.set(key, [...(byColumn.get(key) ?? []), item]);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: t("scheduling.ui.dragInstructions"),
        },
        // Keyboard moves are announced by the grid's own live region.
        announcements: {
          onDragStart: () => t("scheduling.ui.dragPicked"),
          onDragOver: ({ over }) =>
            over
              ? t("scheduling.ui.dragOver", {
                  column: String((over.data.current?.column as GridColumn | undefined)?.label ?? ""),
                })
              : t("scheduling.ui.dragOutside"),
          onDragEnd: () => t("scheduling.ui.dragDropped"),
          onDragCancel: () => t("scheduling.ui.dragCancelled"),
        },
      }}
    >
      <p aria-live="assertive" className="sr-only">
        {announcement}
      </p>
      <div className="overflow-x-auto border-y">
        <div className="flex min-w-max">
          <div className="bg-card sticky left-0 z-10 w-14 shrink-0">
            <div className="h-12 border-b" />
            <div className="relative" style={{ height: (rulerEnd - rulerStart) * PX_PER_MINUTE }}>
              {hours.map((minute) => (
                <span
                  key={minute}
                  className="text-muted-foreground absolute right-2 -translate-y-1/2 text-xs tabular-nums"
                  style={{ top: (minute - rulerStart) * PX_PER_MINUTE }}
                >
                  {minute === rulerStart ? "" : fmt.minute(minute)}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-1 flex-col">
            <div className="bg-paper-1 sticky top-0 z-10 flex h-12 border-b">
              {columns.map((column) => (
                <div
                  key={column.key}
                  className={cn(
                    "flex min-w-[180px] flex-1 flex-col justify-center border-l px-2",
                    column.isToday && "text-foreground border-b-ink-blue border-b-2",
                  )}
                >
                  <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {column.color && column.color in PALETTE ? (
                      <span
                        aria-hidden
                        className={cn(
                          "size-3 shrink-0 rounded-full",
                          PALETTE[column.color as PaletteColor].swatch,
                        )}
                      />
                    ) : null}
                    {column.label}
                  </span>
                  {column.sublabel ? (
                    <span className="text-muted-foreground truncate text-xs">{column.sublabel}</span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex">
              {columns.map((column, index) => (
                <Column
                  key={column.key}
                  moving={moving && moving.column === index ? moving : null}
                  onBlockKey={onBlockKey}
                  showNowLabel={column.key === columns.find((entry) => entry.isToday)?.key}
                  column={column}
                  items={byColumn.get(column.key) ?? []}
                  rulerStart={rulerStart}
                  rulerEnd={rulerEnd}
                  granularity={granularity}
                  timeZone={timeZone}
                  now={now}
                  canBook={canBook}
                  canDrag={canDrag}
                  onSlot={onSlot}
                  onOpen={openBlock}
                  onResize={onResize}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}
