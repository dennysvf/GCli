"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/components/button";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { TemplateItem } from "../application/templates";
import { MAX_ACTIVE_TEMPLATES } from "../domain/limits";
import type { SettingsActions } from "./settings-actions";

// The templates of the clinic (PRD F08): name, type, clinical flag and state, with the counter of
// the 50 active templates. They are deactivated, never deleted: generated documents reference them.
export function TemplatesTable({
  templates,
  actions,
}: {
  templates: TemplateItem[];
  actions: SettingsActions;
}) {
  const t = useTranslations("documents");
  const format = useFormatters();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const activeCount = templates.filter((template) => template.active).length;

  const toggle = (template: TemplateItem) =>
    startTransition(async () => {
      const result = await actions.setTemplateActive({
        templateId: template.id,
        active: !template.active,
        version: template.version,
      });
      if (handleActionResult(result, { successMessage: t("ui.templateSavedToast") })) router.refresh();
    });

  return (
    <section aria-labelledby="templates-title" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="templates-title" className="section-title">
            {t("ui.templatesTitle")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("ui.templatesCount", {
              count: format.number(activeCount),
              max: format.number(MAX_ACTIVE_TEMPLATES),
            })}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/settings/documents/templates/new">{t("ui.newTemplate")}</Link>
        </Button>
      </div>
      <div className="border-y">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ui.columns.name")}</TableHead>
              <TableHead>{t("ui.columns.type")}</TableHead>
              <TableHead className="w-28">{t("ui.categoryClinical")}</TableHead>
              <TableHead className="w-28">{t("ui.columns.status")}</TableHead>
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell>
                  <Link
                    href={`/settings/documents/templates/${template.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {template.name}
                  </Link>
                </TableCell>
                <TableCell>{t(`types.${template.type}`)}</TableCell>
                <TableCell>
                  {template.clinical ? <Stamp variant="info">{t("ui.stampClinical")}</Stamp> : t("ui.no")}
                </TableCell>
                <TableCell>
                  <Stamp variant={template.active ? "success" : "neutral"}>
                    {template.active ? t("ui.stampActive") : t("ui.stampInactive")}
                  </Stamp>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/settings/documents/templates/${template.id}`}>{t("ui.edit")}</Link>
                  </Button>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => toggle(template)}>
                    {template.active ? t("ui.deactivate") : t("ui.activate")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
