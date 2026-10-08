import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CategoriesPanel, StorageUsagePanel, TemplatesTable, documents } from "@/modules/documents";
import { requirePermission } from "@/modules/identity/next";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import {
  createCategoryAction,
  createTemplateAction,
  setCategoryActiveAction,
  setTemplateActiveAction,
  updateCategoryAction,
  updateTemplateAction,
} from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("documents.ui.settingsTitle") };
}

export default async function DocumentsSettingsPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("setup:manage");
  const [usage, categories, templates] = await Promise.all([
    documents.getStorageUsage(ctx),
    documents.listCategories(ctx, { includeInactive: true }),
    documents.listTemplates(ctx, { includeInactive: true }),
  ]);
  const actions = {
    createCategory: createCategoryAction,
    updateCategory: updateCategoryAction,
    setCategoryActive: setCategoryActiveAction,
    createTemplate: createTemplateAction,
    updateTemplate: updateTemplateAction,
    setTemplateActive: setTemplateActiveAction,
  };

  return (
    <div className="grid gap-8">
      <PageHeader title={t("documents.ui.settingsTitle")} meta={t("documents.ui.settingsHint")} />
      {usage.ok ? <StorageUsagePanel usage={usage.value} /> : null}
      <CategoriesPanel categories={categories.ok ? categories.value : []} actions={actions} />
      <TemplatesTable templates={templates.ok ? templates.value : []} actions={actions} />
    </div>
  );
}
