import { useTranslations } from "next-intl";
import { PageHeader } from "./page-header";

// Placeholder for pages delivered by later features (F06 agenda, F12 dashboard).
export function UnderConstruction({ title, feature }: { title: string; feature: string }) {
  const t = useTranslations("shell");
  return (
    <div className="grid gap-6">
      <PageHeader title={title} />
      <p className="text-muted-foreground">{t("underConstruction", { feature })}</p>
    </div>
  );
}
