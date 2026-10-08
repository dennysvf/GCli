import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TemplateEditor, documents } from "@/modules/documents";
import { requirePermission } from "@/modules/identity/next";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { createTemplateAction, updateTemplateAction } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("documents.ui.editTemplate") };
}

export default async function EditTemplatePage({
  params,
}: PageProps<"/settings/documents/templates/[templateId]">) {
  const t = await getTranslations();
  const ctx = await requirePermission("setup:manage");
  const { templateId } = await params;
  const template = await documents.getTemplate(ctx, { templateId });
  if (!template.ok) notFound();
  return (
    <div className="grid gap-6">
      <PageHeader
        title={template.value.name}
        meta={t("documents.ui.editTemplate")}
        breadcrumb={
          <Link href="/settings/documents" className="underline-offset-4 hover:underline">
            {t("documents.ui.settingsTitle")}
          </Link>
        }
      />
      <TemplateEditor
        template={template.value}
        actions={{
          createTemplate: createTemplateAction,
          updateTemplate: updateTemplateAction,
        }}
      />
    </div>
  );
}
