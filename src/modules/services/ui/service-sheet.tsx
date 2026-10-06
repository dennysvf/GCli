"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { type ActionResult } from "@/shared/kernel/action-result";
import { Stamp } from "@/shared/ui/components/stamp";
import { Button } from "@/shared/ui/components/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/components/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/components/tabs";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { PriceChangeItem, SaveServiceResult, ServiceDetails } from "../application/services";
import type { ServiceColor } from "../domain/palette";
import { PriceHistory } from "./price-history";
import { ServiceForm, type PriceCurrency, type SelectableRoom } from "./service-form";
import { useTranslations } from "next-intl";

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
  currencies,
  timeZone,
  canManage,
  actions,
}: {
  service: ServiceDetails | null;
  history: PriceChangeItem[];
  categories: { id: string; name: string }[];
  rooms: SelectableRoom[];
  defaultColor: ServiceColor;
  currencies: PriceCurrency[];
  timeZone: string;
  canManage: boolean;
  actions: ServiceActions;
}) {
  const t = useTranslations();
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
        toast.warning(t("services.ui.deactivatedKept", { count: result.data.futureAppointments }), {
          duration: 8000,
        });
      } else {
        toast.success(
          result.data.active ? t("services.ui.serviceReactivated") : t("services.ui.serviceDeactivated"),
        );
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
      currencies={currencies}
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
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {service ? service.name : t("services.ui.newService")}
            {service ? (
              <Stamp variant={service.active ? "success" : "neutral"}>
                {service.active ? t("common.active") : t("common.inactive")}
              </Stamp>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            {service ? service.categoryName : t("services.ui.serviceSheetHint")}
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-6 pb-6">
          {service ? (
            <Tabs defaultValue="dados">
              <TabsList>
                <TabsTrigger value="dados">{t("common.data")}</TabsTrigger>
                <TabsTrigger value="precos">{t("services.ui.priceHistory")}</TabsTrigger>
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
                    {service.active ? t("services.ui.deactivateService") : t("services.ui.reactivateService")}
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
