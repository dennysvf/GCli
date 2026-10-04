"use client";

import { MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { useTranslations } from "next-intl";

// Header unit selector (PRD F02): active units only; the choice is remembered per user.
export function UnitSelector({
  units,
  selectedId,
  canManage,
  action,
}: {
  units: { id: string; name: string }[];
  selectedId: string | null;
  canManage: boolean;
  action: (input: { unitId: string }) => Promise<ActionResult<unknown>>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (units.length === 0) {
    return (
      <span className="text-muted-foreground flex items-center gap-2 text-sm">
        <MapPin className="size-4" aria-hidden />
        {t("units.ui.noUnitShort")}
        {canManage ? (
          <Link href="/settings/units/new" className="text-foreground underline-offset-4 hover:underline">
            {t("units.ui.registerUnit")}
          </Link>
        ) : null}
      </span>
    );
  }

  return (
    <Select
      value={selectedId ?? undefined}
      disabled={pending}
      onValueChange={(unitId) =>
        startTransition(async () => {
          if (handleActionResult(await action({ unitId }))) router.refresh();
        })
      }
    >
      <SelectTrigger className="w-56" aria-label={t("common.unit")}>
        <MapPin className="size-4" aria-hidden />
        <SelectValue placeholder={t("units.ui.selectUnit")} />
      </SelectTrigger>
      <SelectContent>
        {units.map((unit) => (
          <SelectItem key={unit.id} value={unit.id}>
            {unit.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
