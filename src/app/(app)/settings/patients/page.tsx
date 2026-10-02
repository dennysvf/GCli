import type { Metadata } from "next";
import { requirePermission } from "@/modules/identity/next";
import { ListsPanel, patients } from "@/modules/patients";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { createListItemAction, renameListItemAction, setListItemActiveAction } from "./actions";

export const metadata: Metadata = { title: "Listas de pacientes" };

export default async function PatientListsPage() {
  const ctx = await requirePermission("setup:manage");
  const [sources, tags] = await Promise.all([
    patients.listItems(ctx, "referral-source"),
    patients.listItems(ctx, "tag"),
  ]);
  const actions = {
    create: createListItemAction,
    rename: renameListItemAction,
    setActive: setListItemActiveAction,
  };

  return (
    <div className="grid gap-8">
      <PageHeader title="Listas de pacientes" meta="Opções usadas no cadastro de pacientes." />
      <ListsPanel
        list="referral-source"
        title="Como conheceu a clínica"
        placeholder="Ex.: Instagram"
        items={sources.ok ? sources.value : []}
        actions={actions}
      />
      <ListsPanel
        list="tag"
        title="Etiquetas"
        placeholder="Ex.: Prefere manhãs"
        items={tags.ok ? tags.value : []}
        actions={actions}
      />
    </div>
  );
}
