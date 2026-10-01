"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { interpolate, type ActionResult } from "@/shared/kernel/action-result";
import type { PaletteColor } from "@/shared/kernel/palette";
import { Button } from "@/shared/ui/components/button";
import { Checkbox } from "@/shared/ui/components/checkbox";
import { Label } from "@/shared/ui/components/label";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import type { ReplaceEnabledServicesResult } from "../application/enabled-services";
import { PROFESSIONALS_SERVICES_REMOVED_WITH_APPOINTMENTS } from "../messages";
import { ColorDot } from "./professional-avatar";

export type ServiceOption = {
  id: string;
  name: string;
  categoryName: string;
  color: PaletteColor;
  details: string;
};

// Serviços tab (PRD F04 Experience): checkboxes grouped by category with "Selecionar todos da
// categoria". Only active services are offered (PRD F03 cross-feature).
export function ServicesChecklist({
  professionalId,
  version,
  services,
  enabledIds,
  inactiveServices,
  readOnly = false,
  action,
}: {
  professionalId: string;
  version: number;
  services: ServiceOption[];
  enabledIds: string[];
  inactiveServices: { id: string; name: string }[];
  readOnly?: boolean;
  action: (input: {
    professionalId: string;
    version: number;
    serviceIds: string[];
  }) => Promise<ActionResult<ReplaceEnabledServicesResult>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(() => new Set(enabledIds));

  const groups = [...new Set(services.map((service) => service.categoryName))].map((categoryName) => ({
    categoryName,
    services: services.filter((service) => service.categoryName === categoryName),
  }));

  const toggle = (ids: string[], checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const save = () =>
    startTransition(async () => {
      const result = await action({ professionalId, version, serviceIds: [...selected] });
      if (handleActionResult(result, { successMessage: "Serviços atualizados." })) {
        if (result.data.keptAppointments > 0) {
          toast.warning(
            interpolate(PROFESSIONALS_SERVICES_REMOVED_WITH_APPOINTMENTS, {
              count: result.data.keptAppointments,
            }),
            { duration: 8000 },
          );
        }
        router.refresh();
      }
    });

  if (services.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nenhum serviço ativo cadastrado. Cadastre os serviços em Configurações › Serviços.
      </p>
    );
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <p className="text-muted-foreground text-sm">
        O profissional só pode ser agendado para os serviços marcados. {selected.size} de {services.length}{" "}
        serviços habilitados.
      </p>
      <HydratedFieldset disabled={readOnly}>
        {groups.map((group) => {
          const ids = group.services.map((service) => service.id);
          const allChecked = ids.every((id) => selected.has(id));
          const groupId = `category-${group.categoryName}`;
          return (
            <section key={group.categoryName} aria-labelledby={groupId} className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id={groupId} className="text-sm font-semibold">
                  {group.categoryName}{" "}
                  <span className="text-muted-foreground text-xs font-normal">({group.services.length})</span>
                </h2>
                {readOnly ? null : (
                  <Button type="button" variant="ghost" size="sm" onClick={() => toggle(ids, !allChecked)}>
                    {allChecked ? "Desmarcar todos da categoria" : "Selecionar todos da categoria"}
                  </Button>
                )}
              </div>
              <ul className="divide-y border-y">
                {group.services.map((service) => (
                  <li key={service.id} className="flex items-center gap-3 py-2">
                    <Checkbox
                      id={`service-${service.id}`}
                      checked={selected.has(service.id)}
                      onCheckedChange={(checked) => toggle([service.id], checked === true)}
                      disabled={readOnly}
                    />
                    <Label
                      htmlFor={`service-${service.id}`}
                      className="flex flex-1 items-center gap-2 font-normal"
                    >
                      <ColorDot color={service.color} />
                      <span className="font-semibold">{service.name}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">{service.details}</span>
                    </Label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {inactiveServices.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            Serviço desativado: {inactiveServices.map((service) => service.name).join(", ")}. Ele sai da lista
            ao salvar.
          </p>
        ) : null}
        {readOnly ? null : (
          <div>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Salvando..." : "Salvar serviços"}
            </Button>
          </div>
        )}
      </HydratedFieldset>
    </div>
  );
}
