import Link from "next/link";
import { Button } from "@/shared/ui/components/button";
import { useTranslations } from "next-intl";

// 403 page rendered by forbidden() (PRD F01 Experience).
export default function Forbidden() {
  const t = useTranslations();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-muted-foreground column-label">{t("common.error403")}</p>
      <h1 className="section-title">{t("common.forbiddenTitle")}</h1>
      <Button asChild variant="outline">
        <Link href="/">{t("common.backToStart")}</Link>
      </Button>
    </main>
  );
}
