"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { fetchJson } from "@/shared/ui/query/query-provider";
import type { Agenda, AgendaItem } from "../application/queries";
import { POLLING_INTERVAL_MS } from "../domain/limits";
import type { AppointmentStatus } from "../domain/status";

export type AgendaRequest = {
  unitId: string;
  from: string;
  to: string;
  professionalIds?: string[];
  roomIds?: string[];
  serviceIds?: string[];
  statuses?: AppointmentStatus[];
};

function query(request: AgendaRequest, since?: string): string {
  const params = new URLSearchParams({ unitId: request.unitId, from: request.from, to: request.to });
  if (request.professionalIds?.length) params.set("professionalIds", request.professionalIds.join(","));
  if (request.roomIds?.length) params.set("roomIds", request.roomIds.join(","));
  if (request.serviceIds?.length) params.set("serviceIds", request.serviceIds.join(","));
  if (request.statuses?.length) params.set("statuses", request.statuses.join(","));
  if (since) params.set("since", since);
  return `/api/schedule/appointments?${params.toString()}`;
}

// Merges a polling delta: changed rows replace the old ones; rows that left the visible range or
// the filters (moved, re-assigned) are dropped by the caller's filter (spec F06, ADR-025).
function merge(previous: Agenda, delta: Agenda): Agenda {
  const byId = new Map(previous.items.map((item) => [item.id, item]));
  for (const item of delta.items) byId.set(item.id, item);
  return { ...previous, serverTime: delta.serverTime, items: [...byId.values()] };
}

export function visibleItems(
  items: AgendaItem[],
  request: AgendaRequest,
  rangeStart: number,
  rangeEnd: number,
) {
  return items.filter((item) => {
    const start = Date.parse(item.startsAt);
    const end = Date.parse(item.endsAt);
    if (!(start < rangeEnd && end > rangeStart)) return false;
    if (request.unitId !== "all" && item.unitId !== request.unitId) return false;
    if (request.professionalIds?.length && !request.professionalIds.includes(item.professional.id))
      return false;
    if (request.roomIds?.length && !(item.room && request.roomIds.includes(item.room.id))) return false;
    if (request.serviceIds?.length && !request.serviceIds.includes(item.service.id)) return false;
    if (request.statuses?.length && !request.statuses.includes(item.status)) return false;
    return true;
  });
}

// Agenda data with 30-second polling (PRD F06: changes by other users within 30 seconds) and an
// immediate refresh after the user's own actions.
export function useAgenda(request: AgendaRequest) {
  const client = useQueryClient();
  const key = useMemo(() => ["agenda", query(request)], [request]);
  const result = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const previous = client.getQueryData<Agenda>(key);
      if (previous)
        return merge(previous, await fetchJson<Agenda>(query(request, previous.serverTime), signal));
      return fetchJson<Agenda>(query(request), signal);
    },
    refetchInterval: POLLING_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: key }), [client, key]);
  return { ...result, refresh };
}
