"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import type { AuditFilterOptions, AuditPage } from "../application/views";
import { AuditDetailPanel } from "./audit-detail-panel";
import { AuditExportButton } from "./audit-export-button";
import { AuditFilters, type AuditFieldErrors, type AuditFilterState } from "./audit-filters";
import { AuditTable } from "./audit-table";

const ALL = "ALL";

export type AuditLoadError = { message: string; fields?: Record<string, string> };

// The filters as the query string of the page URL and of the three endpoints (spec F15 section 5).
export function auditQuery(filters: AuditFilterState, cursor?: string | null): string {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.user !== ALL) params.set("user", filters.user);
  if (filters.action !== ALL) params.set("action", filters.action);
  if (filters.entityType !== ALL) params.set("entityType", filters.entityType);
  if (filters.entityType !== ALL && filters.entityId) params.set("entityId", filters.entityId);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

type Failure = { kind: "fields"; fields: AuditFieldErrors } | { kind: "load" };

// The audit log viewer (PRD F15, design system 5.19): the filter bar synced to the URL, the count
// line and "Exportar CSV", the table with keyset pagination, and the detail side panel. A filter
// change cancels the request in flight (spec F15 decision D5).
export function AuditLogView({
  initialFilters,
  initialPage,
  initialError,
  defaults,
  options,
}: {
  initialFilters: AuditFilterState;
  initialPage: AuditPage | null;
  initialError: AuditLoadError | null;
  defaults: AuditFilterState;
  options: AuditFilterOptions;
}) {
  const t = useTranslations("audit");
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(initialPage);
  // The filters of the page on screen, which the export repeats.
  const [applied, setApplied] = useState(initialFilters);
  // Cursors of the pages visited so far: page N was read with cursors[N - 1] (null for page 1).
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [fieldErrors, setFieldErrors] = useState<AuditFieldErrors>(
    (initialError?.fields as AuditFieldErrors | undefined) ?? {},
  );
  const [pageError, setPageError] = useState<string | null>(
    initialError && !initialError.fields ? initialError.message : null,
  );
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const rows = useRef(new Map<string, HTMLTableRowElement>());
  const lastOpened = useRef<string | null>(null);
  const lastRequest = useRef<{ filters: AuditFilterState; cursors: (string | null)[] } | null>(null);

  async function load(next: AuditFilterState, nextCursors: (string | null)[]) {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    lastRequest.current = { filters: next, cursors: nextCursors };
    setLoading(true);
    const cursor = nextCursors.at(-1) ?? null;
    let failure: Failure | null = null;
    try {
      const response = await fetch(`/api/audit/events?${auditQuery(next, cursor)}`, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as
        AuditPage | { code?: string; message?: string; fields?: Record<string, string> } | null;
      if (response.ok && body && "items" in body) {
        setPage(body);
        setApplied(next);
        setCursors(nextCursors);
        setFieldErrors({});
        setPageError(null);
      } else if (response.status === 400 && body && "fields" in body && body.fields) {
        failure = { kind: "fields", fields: body.fields as AuditFieldErrors };
      } else {
        failure = { kind: "load" };
      }
    } catch {
      if (controller.signal.aborted) return;
      failure = { kind: "load" };
    }
    if (controller.signal.aborted) return;
    setLoading(false);
    // The table keeps the previous result while a filter is invalid (design system 5.19).
    if (failure?.kind === "fields") setFieldErrors(failure.fields);
    if (failure?.kind === "load") setPageError(t("states.loadFailed"));
  }

  function apply(next: AuditFilterState) {
    setFilters(next);
    window.history.replaceState(null, "", `?${auditQuery(next)}`);
    void load(next, [null]);
  }

  function open(id: string) {
    lastOpened.current = id;
    setSelectedId(id);
  }

  const matched = page?.matched ?? { count: 0, capped: false };
  const pageNumber = cursors.length;
  const items = page?.items ?? [];

  return (
    <div className="grid gap-4">
      <AuditFilters
        value={filters}
        options={options}
        errors={fieldErrors}
        onChange={apply}
        onClear={() => apply(defaults)}
      />
      {pageError ? (
        <Alert variant="destructive">
          <AlertDescription className="grid gap-2">
            <span>{pageError}</span>
            <Button
              type="button"
              variant="secondary"
              className="w-fit"
              onClick={() => {
                const request = lastRequest.current ?? { filters, cursors };
                void load(request.filters, request.cursors);
              }}
            >
              {t("states.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground pt-2 text-[0.8125rem]" aria-live="polite">
          {loading
            ? t("states.updating")
            : page
              ? matched.capped
                ? t("count.capped", { limit: page.exportLimit })
                : t("count.events", { count: matched.count })
              : null}
        </p>
        <AuditExportButton
          query={auditQuery(applied)}
          count={matched.count}
          capped={matched.capped}
          limit={page?.exportLimit ?? 0}
          disabled={!page || loading}
        />
      </div>
      {page && items.length === 0 ? (
        <p className="text-muted-foreground py-6 text-sm">{t("states.empty")}</p>
      ) : page ? (
        <>
          <AuditTable
            items={items}
            timeZone={page.timeZone}
            selectedId={selectedId}
            onOpen={open}
            rowRef={(id, element) => {
              if (element) rows.current.set(id, element);
              else rows.current.delete(id);
            }}
          />
          <nav aria-label={t("table.pagination")} className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={pageNumber <= 1 || loading}
              onClick={() => void load(applied, cursors.slice(0, -1))}
            >
              {t("table.previous")}
            </Button>
            <span className="text-muted-foreground text-[0.8125rem] tabular-nums" aria-live="polite">
              {t("table.page", { page: pageNumber })}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={!page.nextCursor || loading}
              onClick={() => void load(applied, [...cursors, page.nextCursor])}
            >
              {t("table.next")}
            </Button>
          </nav>
        </>
      ) : null}
      <AuditDetailPanel
        eventId={selectedId}
        onClose={() => setSelectedId(null)}
        onFilterByEntity={(entityType, entityId) => {
          setSelectedId(null);
          apply({ ...filters, entityType, entityId });
        }}
        onCloseAutoFocus={(event) => {
          const row = lastOpened.current ? rows.current.get(lastOpened.current) : undefined;
          if (row) {
            event.preventDefault();
            row.focus();
          }
        }}
      />
    </div>
  );
}
