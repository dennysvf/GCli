import Link from "next/link";
import { formatCents } from "@/shared/kernel/money";
import { Badge } from "@/shared/ui/components/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { cn } from "@/shared/ui/utils";
import type { ServiceGroup } from "../application/services";
import { formatDuration } from "../domain/service-rules";
import { PALETTE } from "./palette";

// Services grouped by category (PRD F03 Experience). Each row opens the side panel through the
// ?service= query, keeping the current filters.
export function ServicesTable({ groups, query }: { groups: ServiceGroup[]; query: string }) {
  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-12 text-center">
        Nenhum serviço encontrado.
      </p>
    );
  }
  const hrefFor = (serviceId: string) => {
    const params = new URLSearchParams(query);
    params.set("service", serviceId);
    return `?${params.toString()}`;
  };

  return (
    <div className="grid gap-6">
      {groups.map(({ category, services }) => (
        <section key={category.id} aria-labelledby={`category-${category.id}`} className="grid gap-2">
          <h2 id={`category-${category.id}`} className="text-lg font-medium">
            {category.name} <span className="text-muted-foreground text-sm">({services.length})</span>
          </h2>
          {services.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
              Nenhum serviço nesta categoria.
            </p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-28">Duração</TableHead>
                    <TableHead className="w-32 text-right">Preço</TableHead>
                    <TableHead className="w-28 text-right">Profissionais</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service) => (
                    <TableRow key={service.id} className={cn(!service.active && "text-muted-foreground")}>
                      <TableCell>
                        <Link
                          href={hrefFor(service.id)}
                          scroll={false}
                          className="flex items-center gap-2 font-medium underline-offset-4 hover:underline"
                        >
                          <span
                            className={cn("size-3 shrink-0 rounded-full", PALETTE[service.color].swatch)}
                            aria-hidden
                          />
                          {service.name}
                        </Link>
                      </TableCell>
                      <TableCell>{formatDuration(service.durationMinutes)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCents(service.priceCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {service.enabledProfessionals}
                      </TableCell>
                      <TableCell>
                        <Badge variant={service.active ? "default" : "secondary"}>
                          {service.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
