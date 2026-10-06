"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Button } from "@/shared/ui/components/button";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { useTranslations } from "next-intl";

export function UnitActiveToggle({
  unitId,
  active,
  action,
}: {
  unitId: string;
  active: boolean;
  action: (input: { unitId: string; active: boolean }) => Promise<ActionResult<unknown>>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className="ml-auto"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await action({ unitId, active: !active });
          if (
            handleActionResult(result, {
              successMessage: active ? t("units.ui.unitDeactivated") : t("units.ui.unitReactivated"),
            })
          ) {
            router.refresh();
          }
        })
      }
    >
      {active ? t("units.ui.deactivateUnit") : t("units.ui.reactivateUnit")}
    </Button>
  );
}
