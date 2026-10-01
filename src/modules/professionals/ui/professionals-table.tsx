import Link from "next/link";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { cn } from "@/shared/ui/utils";
import type { ProfessionalListItem } from "../application/professionals";
import { ColorDot, ProfessionalAvatar } from "./professional-avatar";

// Professionals list (PRD F04 Experience): initials, name, specialty, units, number of services
// and status. A table with fine rules (design system 5.4); below 768 px each row is two lines.
export function ProfessionalsTable({
  items,
  search,
  canManage,
}: {
  items: ProfessionalListItem[];
  search?: string;
  canManage: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        {search
          ? `Nenhum profissional encontrado para "${search}".`
          : canManage
            ? "Nenhum profissional cadastrado ainda. Os profissionais definem quem pode ser agendado."
            : "Nenhum profissional cadastrado ainda."}
      </p>
    );
  }

  return (
    <div className="border-y">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead className="hidden md:table-cell">Especialidade</TableHead>
            <TableHead className="hidden md:table-cell">Unidades</TableHead>
            <TableHead className="hidden w-24 text-right md:table-cell">Serviços</TableHead>
            <TableHead className="w-24">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className={cn(!item.active && "text-muted-foreground")}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <ProfessionalAvatar initials={item.initials} />
                  <div className="grid min-w-0">
                    <Link
                      href={`/settings/professionals/${item.id}`}
                      className="flex items-center gap-2 font-semibold underline-offset-4 hover:underline"
                    >
                      <ColorDot color={item.color} />
                      {item.displayName}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {[item.registration, item.specialty].filter(Boolean).join(" · ") || "—"}
                    </span>
                    <span className="text-muted-foreground text-xs md:hidden">
                      {item.unitNames.join(", ") || "Sem horário vigente"} · {item.enabledServices}{" "}
                      {item.enabledServices === 1 ? "serviço" : "serviços"}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">{item.specialty ?? "—"}</TableCell>
              <TableCell className="hidden md:table-cell">
                {item.unitNames.length > 0 ? item.unitNames.join(", ") : "Sem horário vigente"}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {item.enabledServices}
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
