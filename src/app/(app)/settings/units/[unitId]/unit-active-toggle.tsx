"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Button } from "@/shared/ui/components/button";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";

export function UnitActiveToggle({
  unitId,
  active,
  action,
}: {
  unitId: string;
  active: boolean;
  action: (input: { unitId: string; active: boolean }) => Promise<ActionResult<unknown>>;
}) {
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
              successMessage: active ? "Unidade desativada" : "Unidade reativada",
            })
          ) {
            router.refresh();
          }
        })
      }
    >
      {active ? "Desativar unidade" : "Reativar unidade"}
    </Button>
  );
}
