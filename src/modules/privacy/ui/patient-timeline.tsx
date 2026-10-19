"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import { Skeleton } from "@/shared/ui/components/skeleton";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { ActionResult } from "@/shared/kernel/action-result";
import type { TimelineItem } from "../application/ports";
import type { TimelinePage } from "../application/timeline";
import type { TimelineGroup } from "../domain/timeline-event";
import type { TimelineActions } from "./timeline-actions";
import { TimelineFilters, type TimelineFilterState } from "./timeline-filters";
import { TimelineList } from "./timeline-list";

// The "Linha do tempo" tab of the patient page (PRD F14 Experience, design system 5.20). It is
// mounted when the tab opens, so opening the patient page reads no clinical metadata (spec D7). The
// server decides what the viewer may see; the list loads 50 events per page by infinite scroll, with
// "Carregar mais eventos" as the keyboard alternative and a polite live count.

const SKELETON_DELAY_MS = 300;
const EMPTY_FILTERS: TimelineFilterState = { groups: [], from: "", to: "" };

type Status = "loading" | "ready" | "error";

export function PatientTimeline({ patientId, actions }: { patientId: string; actions: TimelineActions }) {
  const t = useTranslations();
  const [visibleGroups, setVisibleGroups] = useState<TimelineGroup[] | null>(null);
  const [filters, setFilters] = useState<TimelineFilterState>(EMPTY_FILTERS);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const moreButton = useRef<HTMLButtonElement | null>(null);
  // Set synchronously, so the sentinel and the button never read the same page twice.
  const inFlight = useRef(false);
  // The filters of the request in flight: an older answer never overwrites a newer one.
  const generation = useRef(0);

  const query = useCallback(
    (state: TimelineFilterState, groups: TimelineGroup[] | null, cursor: string | null) =>
      actions.list({
        patientId,
        // Every visible group checked is the same as no group filter.
        groups: groups && state.groups.length < groups.length ? state.groups : [],
        from: state.from || null,
        to: state.to || null,
        cursor,
      }),
    [actions, patientId],
  );

  // Shows the answer of a first-page read, unless a newer read started meanwhile. `initial` is the
  // very first read, whose answer tells which groups the viewer may see.
  const showFirstPage = useCallback(
    (result: ActionResult<TimelinePage>, current: number, initial: boolean) => {
      if (current !== generation.current) return;
      setShowSkeleton(false);
      if (!result.ok) {
        if (result.error.code === "AUTH_UNAUTHENTICATED") handleActionResult(result);
        setStatus("error");
        return;
      }
      if (initial) {
        setVisibleGroups(result.data.visibleGroups);
        setFilters((value) => ({ ...value, groups: result.data.visibleGroups }));
      }
      setItems(result.data.items);
      setNextCursor(result.data.nextCursor);
      setStatus("ready");
    },
    [],
  );

  const reload = useCallback(
    (state: TimelineFilterState, groups: TimelineGroup[] | null) => {
      const current = ++generation.current;
      setStatus("loading");
      void query(state, groups, null).then((result) => showFirstPage(result, current, groups === null));
    },
    [query, showFirstPage],
  );

  // The first page is read when the tab opens (the state starts as "loading").
  useEffect(() => {
    const current = ++generation.current;
    void query(EMPTY_FILTERS, null, null).then((result) => showFirstPage(result, current, true));
  }, [query, showFirstPage]);

  // The skeleton appears only when loading takes more than 300 ms (design system 5.8).
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || inFlight.current || status !== "ready") return;
    const current = generation.current;
    inFlight.current = true;
    setLoadingMore(true);
    try {
      const result = await query(filters, visibleGroups, nextCursor);
      if (current !== generation.current) return;
      if (handleActionResult(result)) {
        setItems((value) => {
          const seen = new Set(value.map((item) => item.key));
          return [...value, ...result.data.items.filter((item) => !seen.has(item.key))];
        });
        setNextCursor(result.data.nextCursor);
      }
    } finally {
      inFlight.current = false;
      setLoadingMore(false);
    }
  }, [filters, nextCursor, query, status, visibleGroups]);

  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  // Infinite scroll: the sentinel below the list loads the next page when it scrolls into view.
  // One observer lives as long as the tab: a new observer reports the sentinel at once, so
  // recreating it after each page would chain reads while the end of the list stays on screen.
  // While "Carregar mais eventos" has focus the keyboard is in charge, because focusing the
  // button scrolls the sentinel into view as well.
  useEffect(() => {
    const element = sentinel.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      if (moreButton.current && document.activeElement === moreButton.current) return;
      void loadMoreRef.current();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function applyFilters(next: TimelineFilterState) {
    setFilters(next);
    // A period needs both dates, and the end on or after the start; until then the list stays.
    if ((next.from && !next.to) || (!next.from && next.to)) {
      setPeriodError(null);
      return;
    }
    if (next.from && next.to && next.to < next.from) {
      setPeriodError(t("privacy.validation.periodInvalid"));
      return;
    }
    setPeriodError(null);
    if (visibleGroups && next.groups.length === 0) {
      generation.current++;
      setItems([]);
      setNextCursor(null);
      setStatus("ready");
      return;
    }
    reload(next, visibleGroups);
  }

  function clearFilters() {
    const next = { groups: visibleGroups ?? [], from: "", to: "" };
    setFilters(next);
    setPeriodError(null);
    reload(next, visibleGroups);
  }

  return (
    <div className="grid gap-4">
      {visibleGroups ? (
        <TimelineFilters
          visibleGroups={visibleGroups}
          value={filters}
          periodError={periodError}
          onChange={applyFilters}
          onClear={clearFilters}
        />
      ) : null}

      {status === "error" ? (
        <Alert variant="destructive" className="flex flex-wrap items-center justify-between gap-3">
          <span>{t("privacy.ui.loadError")}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => reload(filters, visibleGroups)}>
            {t("privacy.ui.retry")}
          </Button>
        </Alert>
      ) : null}

      {status === "loading" && showSkeleton ? (
        <div className="grid gap-4" aria-busy="true">
          <span className="sr-only">{t("privacy.ui.loading")}</span>
          {[0, 1, 2].map((index) => (
            <div key={index} className="grid gap-2 pl-8">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
          ))}
        </div>
      ) : null}

      {status === "ready" && items.length === 0 ? (
        <p className="text-muted-foreground">{t("privacy.ui.empty")}</p>
      ) : null}

      {items.length > 0 && status !== "error" ? (
        <TimelineList items={items} patientId={patientId} openNote={actions.openNote} />
      ) : null}

      <div ref={sentinel} aria-hidden className="h-px" />
      <p aria-live="polite" className="sr-only" data-testid="timeline-count">
        {status === "ready" ? t("privacy.ui.loadedCount", { count: items.length }) : ""}
      </p>
      {status === "ready" && nextCursor ? (
        <Button
          ref={moreButton}
          type="button"
          variant="outline"
          className="w-fit"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {t("privacy.ui.loadMore")}
        </Button>
      ) : null}
      {status === "ready" && !nextCursor && items.length > 0 ? (
        <p className="text-muted-foreground text-xs">{t("privacy.ui.end")}</p>
      ) : null}
    </div>
  );
}
