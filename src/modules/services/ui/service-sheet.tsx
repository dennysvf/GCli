"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { interpolate, type ActionResult } from "@/shared/kernel/action-result";
import { Badge } from "@/shared/ui/components/badge";
import { Button } from "@/shared/ui/components/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/components/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/components/tabs";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { PriceChangeItem, SaveServiceResult, ServiceDetails } from "../application/services";
import type { ServiceColor } from "../domain/palette";
import { SERVICES_DEACTIVATED_WITH_APPOINTMENTS } from "../messages";
import { PriceHistory } from "./price-history";
import { ServiceForm, type SelectableRoom } from "./service-form";

type ServiceActions = {
  save: (input: Record<string, unknown>) => Promise<ActionResult<SaveServiceResult>>;
  setActive: (input: {
    serviceId: string;
    active: boolean;
  }) => Promise<ActionResult<{ active: boolean; futureAppointments: number }>>;
  createCategory: (input: { name: string }) => Promise<ActionResult<{ categoryId: string }>>;
};

// Side panel of the services page (PRD F03 Experience), opened by the ?service= query.
export function ServiceSheet({
  service,
  history,
  categories,
  rooms,
  defaultColor,
  timeZone,
  canManage,
  actions,
}: {
  service: ServiceDetails | null;
  history: PriceChangeItem[];
  categories: { id: string; name: string }[];
  rooms: SelectableRoom[];
  defaultColor: ServiceColor;
  timeZone: string;
  canManage: boolean;
  actions: ServiceActions;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function urlWith(serviceId: string | null) {
    const next = new URLSearchParams(params);
    if (serviceId) next.set("service", serviceId);
    else next.delete("service");
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function toggleActive() {
    if (!service) return;
    startTransition(async () => {
      const result = await actions.setActive({ serviceId: service.id, active: !service.active });
      if (!handleActionResult(result)) return;
      // PRD F03: deactivation keeps future appointments and says how many.
      if (result.data.futureAppointments > 0) {
        toast.warning(
          interpolate(SERVICES_DEACTIVATED_WITH_APPOINTMENTS, { count: result.data.futureAppointments }),
        );
      } else {
        toast.success(result.data.active ? "Serviço reativado" : "Serviço desativado");
      }
      router.refresh();
    });
  }

  const form = (
    <ServiceForm
      key={service ? `${service.id}-${service.version}` : "new"}
      service={service ?? undefined}
      categories={categories}
      rooms={rooms}
      defaultColor={defaultColor}
      readOnly={!canManage}
      action={(input) => actions.save(input)}
      createCategoryAction={actions.createCategory}
      onSaved={(serviceId) => {
        router.replace(urlWith(serviceId), { scroll: false });
        router.refresh();
      }}
    />
  );

  return (
    <Sheet open onOpenChange={(open) => !open && router.push(urlWith(null), { scroll: false })}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {service ? service.name : "Novo serviço"}
            {service ? (
              <Badge variant={service.active ? "default" : "secondary"}>
                {service.active ? "Ativo" : "Inativo"}
              </Badge>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            {service ? service.categoryName : "Preencha os dados do serviço."}
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-6">
          {service ? (
            <Tabs defaultValue="dados">
              <TabsList>
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="precos">Histórico de preços</TabsTrigger>
              </TabsList>
              <TabsContent value="dados" className="grid gap-4 pt-2">
                {form}
                {canManage ? (
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={toggleActive}
                    className="justify-self-start"
                  >
                    {service.active ? "Desativar serviço" : "Reativar serviço"}
                  </Button>
                ) : null}
              </TabsContent>
              <TabsContent value="precos" className="pt-2">
                <PriceHistory changes={history} timeZone={timeZone} />
              </TabsContent>
            </Tabs>
          ) : (
            form
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
