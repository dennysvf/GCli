import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TemplateEditor } from "@/modules/documents";
import { requirePermission } from "@/modules/identity/next";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { createTemplateAction, updateTemplateAction } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("documents.ui.newTemplate") };
}

export default async function NewTemplatePage() {
  const t = await getTranslations();
  await requirePermission("setup:manage");
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("documents.ui.newTemplate")}
        breadcrumb={
          <Link href="/settings/documents" className="underline-offset-4 hover:underline">
            {t("documents.ui.settingsTitle")}
          </Link>
        }
      />
      <TemplateEditor
        template={null}
        actions={{
          createTemplate: createTemplateAction,
          updateTemplate: updateTemplateAction,
        }}
      />
    </div>
  );
}
