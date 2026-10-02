import Link from "next/link";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import type { AgendaItem } from "../application/queries";
import { dateTimeOf, STATUS_STAMPS, statusText } from "./format";

// List view (PRD F06: table with pagination of 50) and the patient's Agendamentos tab. The first
// column opens the appointment (design system 5.4).
export function AppointmentsTable({
  items,
  hrefOf,
  showPatient = true,
  emptyText,
}: {
  items: AgendaItem[];
  hrefOf: (item: AgendaItem) => string;
  showPatient?: boolean;
  emptyText: string;
}) {
  if (items.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;
  return (
    <div className="border-y">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data e hora</TableHead>
            {showPatient ? <TableHead>Paciente</TableHead> : null}
            <TableHead className="hidden md:table-cell">Serviço</TableHead>
            <TableHead className="hidden md:table-cell">Profissional</TableHead>
            <TableHead className="hidden lg:table-cell">Sala</TableHead>
            <TableHead className="hidden lg:table-cell">Unidade</TableHead>
            <TableHead className="w-36">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="tabular-nums">
                <Link
                  href={hrefOf(item)}
                  scroll={false}
                  className="text-primary font-semibold hover:underline"
                >
                  {dateTimeOf(item.startsAt, item.unitTimeZone)}
                </Link>
              </TableCell>
              {showPatient ? (
                <TableCell className="font-semibold">{item.patient.displayName}</TableCell>
              ) : null}
              <TableCell className="hidden md:table-cell">{item.service.name}</TableCell>
              <TableCell className="hidden md:table-cell">{item.professional.displayName}</TableCell>
              <TableCell className="hidden lg:table-cell">{item.room?.name ?? "—"}</TableCell>
              <TableCell className="hidden lg:table-cell">{item.unitName}</TableCell>
              <TableCell>
                <span className="flex flex-wrap gap-1">
                  <Stamp variant={STATUS_STAMPS[item.status]}>{statusText(item.status)}</Stamp>
                  {item.isOverbooking ? <Stamp variant="warning">ENCAIXE</Stamp> : null}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
