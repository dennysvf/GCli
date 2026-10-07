import { useTranslations } from "next-intl";
import { Stamp } from "@/shared/ui/components/stamp";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { StorageUsage as Usage } from "../application/quota";
import { QUOTA_GB } from "../domain/limits";

// The usage of the document storage (PRD F08, design system 5.13): "{used} de 50 GB usados
// ({percent}%)" with a bar, and the level written as text at 80% and 100%.
export function StorageUsagePanel({ usage }: { usage: Usage }) {
  const t = useTranslations("documents");
  const format = useFormatters();
  const usedGb = usage.usedBytes / (1024 * 1024 * 1024);
  return (
    <section aria-labelledby="storage-usage-title" className="grid gap-2">
      <h2 id="storage-usage-title" className="section-title">
        {t("ui.storageTitle")}
      </h2>
      <p className="text-sm">
        {t("ui.storageUsed", {
          used: format.number(usedGb, { maximumFractionDigits: 1 }),
          quota: QUOTA_GB,
          percent: format.number(usage.percent),
        })}
      </p>
      <progress
        value={usage.percent}
        max={100}
        className="w-full max-w-md"
        aria-labelledby="storage-usage-title"
      />
      {usage.level === "warning" ? <Stamp variant="warning">{t("ui.storageWarning")}</Stamp> : null}
      {usage.level === "full" ? <Stamp variant="danger">{t("ui.storageFull")}</Stamp> : null}
    </section>
  );
}
