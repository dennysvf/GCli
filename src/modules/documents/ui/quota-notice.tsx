"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/shared/ui/components/alert";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { StorageUsage } from "../application/quota";
import { QUOTA_GB } from "../domain/limits";

// The notice of the upload dialog (PRD F08): a warning at 80% of the quota and a danger when it is
// full, written as text so it does not rely on color.
export function QuotaNotice({ usage }: { usage: StorageUsage | null }) {
  const t = useTranslations("documents");
  const format = useFormatters();
  if (!usage || usage.level === "ok") return null;
  if (usage.level === "full") {
    return <Alert variant="destructive">{t("errors.DOCUMENT_QUOTA_EXCEEDED")}</Alert>;
  }
  return (
    <Alert variant="warning">
      {t("ui.quotaWarning", { percent: format.number(usage.percent), quota: QUOTA_GB })}
    </Alert>
  );
}
