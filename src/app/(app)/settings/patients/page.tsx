import type { Metadata } from "next";
import { requirePermission } from "@/modules/identity/next";
import { ListsPanel, patients } from "@/modules/patients";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { createListItemAction, renameListItemAction, setListItemActiveAction } from "./actions";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("patients.ui.patientLists") };
}

export default async function PatientListsPage() {
  const t = await getTranslations();
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
      <PageHeader title={t("patients.ui.patientLists")} meta={t("patients.ui.patientListsHint")} />
      <ListsPanel
        list="referral-source"
        title={t("patients.ui.referralSource")}
        placeholder={t("patients.ui.referralSourcePlaceholder")}
        items={sources.ok ? sources.value : []}
        actions={actions}
      />
      <ListsPanel
        list="tag"
        title={t("common.tags")}
        placeholder={t("patients.ui.tagPlaceholder")}
        items={tags.ok ? tags.value : []}
        actions={actions}
      />
    </div>
  );
}
