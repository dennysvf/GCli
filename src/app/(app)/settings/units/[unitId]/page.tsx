import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/identity/next";
import { BusinessHoursForm, ClosuresPanel, RoomsPanel, UnitForm, units } from "@/modules/units";
import { can } from "@/shared/authz/permissions";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { Badge } from "@/shared/ui/components/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/components/tabs";
import { UnitActiveToggle } from "./unit-active-toggle";
import {
  createClosureAction,
  createRoomAction,
  deleteClosureAction,
  replaceBusinessHoursAction,
  setRoomActiveAction,
  setUnitActiveAction,
  updateRoomAction,
  updateUnitAction,
} from "../actions";

export const metadata: Metadata = { title: "Unidade" };

const TABS = ["dados", "horario", "salas", "fechamentos"] as const;

export default async function UnitPage({ params, searchParams }: PageProps<"/settings/units/[unitId]">) {
  const ctx = await requirePermission("setup:read");
  const { unitId } = await params;
  const { tab } = await searchParams;
  const activeTab = TABS.find((value) => value === tab) ?? "dados";
  const readOnly = !can(ctx, "setup:manage");

  const unit = await units.getUnit(ctx, unitId);
  if (!unit.ok) notFound();
  const [hours, rooms, closures] = await Promise.all([
    units.getBusinessHours(ctx, unitId),
    units.listRooms(ctx, unitId),
    units.listClosures(ctx, unitId),
  ]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/settings/units"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Unidades
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-semibold">{unit.value.name}</h1>
        <Badge variant={unit.value.active ? "default" : "secondary"}>
          {unit.value.active ? "Ativa" : "Inativa"}
        </Badge>
        {readOnly ? null : (
          <UnitActiveToggle unitId={unitId} active={unit.value.active} action={setUnitActiveAction} />
        )}
      </div>
      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="horario">Horário de funcionamento</TabsTrigger>
          <TabsTrigger value="salas">Salas</TabsTrigger>
          <TabsTrigger value="fechamentos">Fechamentos</TabsTrigger>
        </TabsList>
        <TabsContent value="dados" className="pt-4">
          <UnitForm
            unit={unit.value}
            defaultTimeZone={unit.value.timeZone}
            readOnly={readOnly}
            action={updateUnitAction}
          />
        </TabsContent>
        <TabsContent value="horario" className="pt-4">
          <p className="text-muted-foreground mb-4 text-sm">
            Horários no fuso da unidade. Até dois intervalos por dia, em múltiplos de 5 minutos.
          </p>
          <BusinessHoursForm
            unitId={unitId}
            initial={hours.ok ? hours.value : []}
            readOnly={readOnly}
            action={replaceBusinessHoursAction}
          />
        </TabsContent>
        <TabsContent value="salas" className="pt-4">
          <RoomsPanel
            unitId={unitId}
            rooms={rooms.ok ? rooms.value : []}
            readOnly={readOnly}
            actions={{ create: createRoomAction, update: updateRoomAction, setActive: setRoomActiveAction }}
          />
        </TabsContent>
        <TabsContent value="fechamentos" className="pt-4">
          <ClosuresPanel
            unitId={unitId}
            closures={closures.ok ? closures.value : []}
            today={dateInTimeZone(new Date(), unit.value.timeZone)}
            readOnly={readOnly}
            actions={{ create: createClosureAction, remove: deleteClosureAction }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
