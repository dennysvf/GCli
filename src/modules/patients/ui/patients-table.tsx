import Link from "next/link";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { cn } from "@/shared/ui/utils";
import type { PatientSearchItem } from "../application/search";
import { formatDateBR } from "./format";

// Search results (PRD F05): name, age, CPF (masked for Front Desk), phone and last appointment.
export function PatientsTable({ items }: { items: PatientSearchItem[] }) {
  return (
    <div className="border-y">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead className="w-20 text-right">Idade</TableHead>
            <TableHead className="hidden md:table-cell">CPF</TableHead>
            <TableHead className="hidden md:table-cell">Celular</TableHead>
            <TableHead className="hidden lg:table-cell">Último agendamento</TableHead>
            <TableHead className="w-24">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className={cn(!item.active && "text-muted-foreground")}>
              <TableCell>
                <div className="grid">
                  <Link
                    href={`/patients/${item.id}`}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {item.displayName}
                  </Link>
                  <span className="text-muted-foreground text-xs tabular-nums md:hidden">
                    {item.cpf ?? "CPF não informado"} · {item.mobilePhone}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{item.age}</TableCell>
              <TableCell className="hidden tabular-nums md:table-cell">{item.cpf ?? "—"}</TableCell>
              <TableCell className="hidden tabular-nums md:table-cell">{item.mobilePhone}</TableCell>
              <TableCell className="hidden tabular-nums lg:table-cell">
                {item.lastAppointmentAt ? formatDateBR(item.lastAppointmentAt) : "—"}
              </TableCell>
              <TableCell>
                <Stamp variant={item.active ? "success" : "neutral"}>
                  {item.active ? "Ativo" : "Inativo"}
                </Stamp>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
