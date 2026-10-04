"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/shared/kernel/action-result";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/components/alert-dialog";
import { Button } from "@/shared/ui/components/button";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { useTranslations } from "next-intl";

// Deactivation asks first (design system 5.7) and, when future appointments block it (PRD F04),
// keeps the message on screen with a link to the filtered agenda list (F06 URL contract).
export function ProfessionalActiveToggle({
  professionalId,
  active,
  appointmentsHref,
  action,
}: {
  professionalId: string;
  active: boolean;
  appointmentsHref: string;
  action: (input: { professionalId: string; active: boolean }) => Promise<ActionResult<{ active: boolean }>>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const run = () =>
    startTransition(async () => {
      setConfirming(false);
      const result = await action({ professionalId, active: !active });
      if (!result.ok && result.error.code === "PROFESSIONALS_HAS_FUTURE_APPOINTMENTS") {
        toast.error(result.error.message, {
          duration: Infinity,
          closeButton: true,
          action: {
            label: t("professionals.ui.viewAppointments"),
            onClick: () => router.push(appointmentsHref),
          },
        });
        return;
      }
      if (
        handleActionResult(result, {
          successMessage: active
            ? t("professionals.ui.professionalDeactivated")
            : t("professionals.ui.professionalReactivated"),
        })
      ) {
        router.refresh();
      }
    });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={active ? "text-destructive" : undefined}
        disabled={pending}
        onClick={() => (active ? setConfirming(true) : run())}
      >
        {active ? t("professionals.ui.deactivate") : t("professionals.ui.reactivate")}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("professionals.ui.deactivateConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("professionals.ui.deactivateBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={run}>
              {t("professionals.ui.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
