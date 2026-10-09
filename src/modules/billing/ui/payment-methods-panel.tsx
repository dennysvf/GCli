"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Checkbox } from "@/shared/ui/components/checkbox";
import { Label } from "@/shared/ui/components/label";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { PaymentMethodSetting } from "../application/payment-methods";
import type { BillingActions } from "./billing-actions";

// Configurações > Financeiro: the payment methods of each country the organization's units use.
// The codes come from the country profile; the clinic only turns them on or off (PRD F09).
export function PaymentMethodsPanel({
  initial,
  actions,
}: {
  initial: PaymentMethodSetting[];
  actions: Pick<BillingActions, "setMethod">;
}) {
  const t = useTranslations("billing.ui");
  const tc = useTranslations();
  const [settings, setSettings] = useState(initial);
  const [pending, startTransition] = useTransition();
  const countries = [...new Set(settings.map((setting) => setting.country))];

  function toggle(setting: PaymentMethodSetting, enabled: boolean) {
    startTransition(async () => {
      const result = await actions.setMethod({ country: setting.country, method: setting.method, enabled });
      if (!handleActionResult(result, { successMessage: t("methodsSavedToast") })) return;
      setSettings((current) =>
        current.map((item) =>
          item.country === setting.country && item.method === setting.method ? { ...item, enabled } : item,
        ),
      );
    });
  }

  return (
    <div className="grid gap-6">
      {countries.map((country) => (
        <section key={country} className="grid gap-2" aria-label={tc(`countries.names.${country}`)}>
          <h2 className="section-title">{tc(`countries.names.${country}`)}</h2>
          <ul className="grid gap-2">
            {settings
              .filter((setting) => setting.country === country)
              .map((setting) => {
                const id = `method-${country}-${setting.method}`;
                return (
                  <li key={id} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={setting.enabled}
                      disabled={pending}
                      onCheckedChange={(checked) => toggle(setting, checked === true)}
                    />
                    <Label htmlFor={id}>{tc(`countries.paymentMethods.${setting.method}`)}</Label>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
