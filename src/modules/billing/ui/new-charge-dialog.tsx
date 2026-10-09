"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { Currency } from "@/shared/kernel/countries/codes";
import { Button } from "@/shared/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/components/dialog";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { MoneyInput } from "@/shared/ui/forms/money-input";
import type { NewChargeOptions } from "../application/queries";
import type { ChargeView } from "../application/views";
import type { BillingActions } from "./billing-actions";

type PatientHit = { id: string; displayName: string };
const MIN_SEARCH = 3;
const NONE = "none";
const SERVICE = "service";
const DESCRIPTION = "description";

// "Nova cobrança" (PRD F09): a patient, a service with an editable price or a free description,
// the unit (it sets the currency) and an optional professional. One item per charge.
export function NewChargeDialog({
  patient,
  actions,
  onCreated,
  onClose,
}: {
  patient: PatientHit | null;
  actions: Pick<BillingActions, "createCharge" | "newChargeOptions">;
  onCreated: (charge: ChargeView) => void;
  onClose: () => void;
}) {
  const t = useTranslations("billing.ui");
  const [options, setOptions] = useState<NewChargeOptions | null>(null);
  const [chosen, setChosen] = useState<PatientHit | null>(patient);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [mode, setMode] = useState<typeof SERVICE | typeof DESCRIPTION>(DESCRIPTION);
  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [grossMinor, setGrossMinor] = useState(0);
  const [professionalId, setProfessionalId] = useState(NONE);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void actions.newChargeOptions({}).then((result) => {
      if (!active) return;
      if (!handleActionResult(result)) return onClose();
      setOptions(result.data);
      setUnitId(result.data.selectedUnitId ?? result.data.units[0]?.id ?? "");
    });
    return () => {
      active = false;
    };
  }, [actions, onClose]);

  useEffect(() => {
    const text = term.trim();
    if (chosen || text.replace(/\s/g, "").length < MIN_SEARCH) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/patients/search?limit=6&q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return setHits([]);
        const data = (await response.json()) as { items: PatientHit[] };
        setHits(data.items);
      } catch {
        // Aborted by the next keystroke.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, chosen]);

  const unit = options?.units.find((item) => item.id === unitId);
  const service = options?.services.find((item) => item.id === serviceId);

  function pickService(id: string) {
    setServiceId(id);
    const price = options?.services
      .find((item) => item.id === id)
      ?.prices.find((entry) => entry.currency === unit?.currency);
    if (price) setGrossMinor(price.amountMinor);
  }

  const valid =
    !!chosen && !!unit && grossMinor > 0 && (mode === SERVICE ? !!service : description.trim().length > 0);

  function submit() {
    if (!chosen || !unit) return;
    startTransition(async () => {
      const result = await actions.createCharge({
        patientId: chosen.id,
        unitId: unit.id,
        grossMinor,
        ...(mode === SERVICE ? { serviceId } : { description: description.trim() }),
        ...(professionalId !== NONE ? { professionalId } : {}),
      });
      if (!handleActionResult(result)) return;
      toast.success(t("chargeCreatedToast"));
      onCreated(result.data);
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !pending) submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("newCharge")}</DialogTitle>
            <DialogDescription>{t("newChargeHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1">
            <Label htmlFor="charge-patient">{t("columnPatient")}</Label>
            {chosen ? (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <span className="text-sm font-semibold">{chosen.displayName}</span>
                {patient ? null : (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setChosen(null)}>
                    {t("changePatient")}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Input
                  id="charge-patient"
                  value={term}
                  autoComplete="off"
                  placeholder={t("searchPatient")}
                  onChange={(event) => setTerm(event.target.value)}
                />
                <ul className="grid gap-1">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => setChosen(hit)}
                      >
                        {hit.displayName}
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {options ? (
            <>
              <div className="grid gap-1">
                <Label htmlFor="charge-unit">{t("chargeUnit")}</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger id="charge-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.units.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} ({item.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="charge-mode">{t("itemKind")}</Label>
                <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
                  <SelectTrigger id="charge-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DESCRIPTION}>{t("freeDescription")}</SelectItem>
                    <SelectItem value={SERVICE}>{t("service")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mode === SERVICE ? (
                <div className="grid gap-1">
                  <Label htmlFor="charge-service">{t("service")}</Label>
                  <Select value={serviceId} onValueChange={pickService}>
                    <SelectTrigger id="charge-service">
                      <SelectValue placeholder={t("chooseService")} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.services.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid gap-1">
                  <Label htmlFor="charge-description">{t("description")}</Label>
                  <Input
                    id="charge-description"
                    value={description}
                    maxLength={200}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              )}
              <div className="grid gap-1">
                <Label htmlFor="charge-amount">{t("chargeAmount")}</Label>
                <MoneyInput
                  id="charge-amount"
                  currency={(unit?.currency ?? "BRL") as Currency}
                  value={grossMinor}
                  onChange={setGrossMinor}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="charge-professional">{t("professionalOptional")}</Label>
                <Select value={professionalId} onValueChange={setProfessionalId}>
                  <SelectTrigger id="charge-professional">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("noProfessional")}</SelectItem>
                    {options.professionals.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={!valid || pending}>
              {t("createCharge")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
