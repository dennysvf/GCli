import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { units } from "@/modules/units";
import { requirePermission } from "@/modules/identity/next";
import { can } from "@/shared/authz/permissions";
import { Stamp } from "@/shared/ui/components/stamp";
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
      <PageHeader
        title="Unidades"
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/settings/units/new">
                <Plus />
                Nova unidade
              </Link>
            </Button>
          ) : null
        }
      />
      {list.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhuma unidade cadastrada ainda. As unidades definem onde a clínica atende, com horário de
          funcionamento e salas.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((unit) => (
            <Link key={unit.id} href={`/settings/units/${unit.id}`} className="rounded-xl">
              <Card className="hover:bg-muted h-full transition-colors">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <CardTitle>{unit.name}</CardTitle>
                  <Stamp variant={unit.active ? "success" : "neutral"}>
                    {unit.active ? "Ativa" : "Inativa"}
                  </Stamp>
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
