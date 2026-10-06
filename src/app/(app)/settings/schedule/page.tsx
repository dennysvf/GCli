import type { Metadata } from "next";
import { requirePermission } from "@/modules/identity/next";
import { CancellationReasonsPanel, scheduling } from "@/modules/scheduling";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { createReasonAction, renameReasonAction, setReasonActiveAction } from "./actions";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("scheduling.ui.cancellationReasons") };
}

export default async function CancellationReasonsPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("setup:manage");
  const reasons = await scheduling.listCancellationReasons(ctx);
  return (
    <div className="grid gap-8">
      <PageHeader
        title={t("scheduling.ui.cancellationReasons")}
        meta={t("scheduling.ui.cancellationReasonsHint")}
      />
      <CancellationReasonsPanel
        items={reasons.ok ? reasons.value : []}
        actions={{ create: createReasonAction, rename: renameReasonAction, setActive: setReasonActiveAction }}
      />
    </div>
  );
}
