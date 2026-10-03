"use client";

import { Button } from "@/shared/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import type { OccurrencePreview, SeriesPreview } from "../application/series";
import { shortDate, slotTimes, weekdayShort } from "./format";

export type Resolution =
  { index: number; action: "SKIP" } | { index: number; action: "RETIME"; startTime: string };

// Series conflicts (PRD F06 Error Handling, design system 5.11): "4 de 20 sessões possuem
// conflito." and, per occurrence, "Pular" or "Escolher outro horário".
export function SeriesConflicts({
  preview,
  resolutions,
  onResolve,
  granularity,
}: {
  preview: SeriesPreview;
  resolutions: Resolution[];
  onResolve: (resolutions: Resolution[]) => void;
  granularity: number;
}) {
  const conflicting = preview.occurrences.filter((item) => item.status === "CONFLICT");
  const resolved = (index: number) => resolutions.find((item) => item.index === index);
  const set = (resolution: Resolution | null, index: number) =>
    onResolve([...resolutions.filter((item) => item.index !== index), ...(resolution ? [resolution] : [])]);
  const pending = conflicting.filter((item) => !resolved(item.index)).length;

  return (
    <div className="grid gap-2" aria-live="polite">
      <p className="text-sm font-semibold">
        {preview.conflicts} de {preview.total} sessões possuem conflito.
        {pending === 0 && preview.conflicts > 0 ? " Todos os conflitos foram resolvidos." : ""}
      </p>
      <div className="border-y">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Sessão</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Conflito</TableHead>
              <TableHead className="w-44">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conflicting.map((item: OccurrencePreview) => {
              const decision = resolved(item.index);
              return (
                <TableRow key={item.index}>
                  <TableCell className="tabular-nums">{item.index}</TableCell>
                  <TableCell className="tabular-nums">
                    {weekdayShort(item.date)}, {shortDate(item.date)} {item.startTime}
                  </TableCell>
                  <TableCell className="text-xs">{item.findings[0]?.message}</TableCell>
                  <TableCell>
                    {decision?.action === "SKIP" ? (
                      <span className="text-sm">
                        Pulada{" "}
                        <Button type="button" variant="link" size="sm" onClick={() => set(null, item.index)}>
                          Desfazer
                        </Button>
                      </span>
                    ) : (
                      <div className="grid gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => set({ index: item.index, action: "SKIP" }, item.index)}
                        >
                          Pular
                        </Button>
                        <Select
                          value={decision?.action === "RETIME" ? decision.startTime : ""}
                          onValueChange={(startTime) =>
                            set({ index: item.index, action: "RETIME", startTime }, item.index)
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label={`Escolher outro horário para a sessão ${item.index}`}
                          >
                            <SelectValue placeholder="Escolher outro horário" />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              ...item.suggestions,
                              ...slotTimes(granularity, 6 * 60, 22 * 60).filter(
                                (time) => !item.suggestions.includes(time),
                              ),
                            ].map((time, index) => (
                              <SelectItem key={time} value={time}>
                                {time}
                                {index < item.suggestions.length ? " (livre)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {decision?.action === "RETIME" ? (
                          <span className="text-muted-foreground text-xs">
                            Novo horário {decision.startTime}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function allResolved(preview: SeriesPreview, resolutions: Resolution[]): boolean {
  return preview.occurrences
    .filter((item) => item.status === "CONFLICT")
    .every((item) => resolutions.some((resolution) => resolution.index === item.index));
}
