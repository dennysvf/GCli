import type { Metadata } from "next";
import { requirePermission } from "@/modules/identity/next";
import { CancellationReasonsPanel, scheduling } from "@/modules/scheduling";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { createReasonAction, renameReasonAction, setReasonActiveAction } from "./actions";

export const metadata: Metadata = { title: "Motivos de cancelamento" };

export default async function CancellationReasonsPage() {
  const ctx = await requirePermission("setup:manage");
  const reasons = await scheduling.listCancellationReasons(ctx);
  return (
    <div className="grid gap-8">
      <PageHeader title="Motivos de cancelamento" meta="Opções exigidas ao cancelar um agendamento." />
      <CancellationReasonsPanel
        items={reasons.ok ? reasons.value : []}
        actions={{ create: createReasonAction, rename: renameReasonAction, setActive: setReasonActiveAction }}
      />
    </div>
  );
}
