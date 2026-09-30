import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { units } from "@/modules/units";
import { requirePermission } from "@/modules/identity/next";
import { can } from "@/shared/authz/permissions";
import { Badge } from "@/shared/ui/components/badge";
import { Button } from "@/shared/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/components/card";

export const metadata: Metadata = { title: "Unidades" };

export default async function UnitsPage() {
  const ctx = await requirePermission("setup:read");
  const result = await units.listUnits(ctx);
  const list = result.ok ? result.value : [];
  const canManage = can(ctx, "setup:manage");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Unidades</h1>
        {canManage ? (
          <Button asChild>
            <Link href="/settings/units/new">
              <Plus />
              Nova unidade
            </Link>
          </Button>
        ) : null}
      </div>
      {list.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-12 text-center">
          Nenhuma unidade cadastrada.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((unit) => (
            <Link
              key={unit.id}
              href={`/settings/units/${unit.id}`}
              className="rounded-xl focus-visible:outline-2"
            >
              <Card className="hover:bg-muted/40 h-full transition-colors">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <CardTitle>{unit.name}</CardTitle>
                  <Badge variant={unit.active ? "default" : "secondary"}>
                    {unit.active ? "Ativa" : "Inativa"}
                  </Badge>
                </CardHeader>
                <CardContent className="text-muted-foreground grid gap-1 text-sm">
                  <span>{unit.city ?? "Cidade não informada"}</span>
                  <span>
                    {unit.activeRoomCount} {unit.activeRoomCount === 1 ? "sala ativa" : "salas ativas"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
