"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/components/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { Field } from "@/shared/ui/forms/field";
import { fetchJson } from "@/shared/ui/query/query-provider";
import type { AvailableSlotDto } from "../application/find-available-slots";
import type { ServiceOption } from "./booking-panel";
import { shortDate, weekdayShort } from "./format";

const ANY = "__any__";

// "Próximo horário livre" (PRD F06, design system 5.11): service required, professional optional,
// up to 10 slots within 60 days; "Agendar" opens the booking panel prefilled.
export function AvailabilityDialog({
  open,
  onOpenChange,
  unitId,
  services,
  professionals,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  services: ServiceOption[];
  professionals: { id: string; label: string }[];
  onPick: (slot: AvailableSlotDto, serviceId: string) => void;
}) {
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState(ANY);
  const [slots, setSlots] = useState<AvailableSlotDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function search() {
    if (!serviceId) return;
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({ unitId, serviceId });
    if (professionalId !== ANY) params.set("professionalId", professionalId);
    try {
      const data = await fetchJson<{ slots: AvailableSlotDto[] }>(
        `/api/schedule/availability?${params.toString()}`,
      );
      setSlots(data.slots);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Próximo horário livre</DialogTitle>
          <DialogDescription>Os 10 primeiros horários livres nos próximos 60 dias.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <Field id="availability-service" label="Serviço">
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger id="availability-service" className="w-full">
                <SelectValue placeholder="Escolha o serviço" />
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
          <Field id="availability-professional" label="Profissional">
            <Select value={professionalId} onValueChange={setProfessionalId}>
              <SelectTrigger id="availability-professional" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Qualquer profissional</SelectItem>
                {professionals.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" variant="secondary" disabled={!serviceId || loading}>
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </form>
        {failed ? (
          <p className="text-destructive text-sm">Não foi possível buscar agora. Tente novamente.</p>
        ) : null}
        {slots && slots.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum horário livre nos próximos 60 dias.</p>
        ) : null}
        {slots && slots.length > 0 ? (
          <div className="border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Sala</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {slots.map((slot) => (
                  <TableRow key={`${slot.startsAt}-${slot.professionalId}`}>
                    <TableCell className="tabular-nums">
                      {weekdayShort(slot.date)}, {shortDate(slot.date)}
                    </TableCell>
                    <TableCell className="tabular-nums">{slot.startTime}</TableCell>
                    <TableCell>{slot.professionalName}</TableCell>
                    <TableCell>{slot.roomName ?? "—"}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="sm" onClick={() => onPick(slot, serviceId)}>
                        Agendar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
