import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReportId } from "../application/reports/types";

// The list of the five reports (PRD F13, design system 5.18): the name is the link, with a short
// description under it. A list, not a card grid.
export function ReportsIndex({ reports }: { reports: readonly ReportId[] }) {
  const t = useTranslations("analytics.reports");
  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-[0.8125rem]">{t("indexIntro")}</p>
      <ul className="divide-border border-border divide-y border-y">
        {reports.map((report) => (
          <li key={report} className="grid gap-1 py-3">
            <Link
              href={`/reports/${report}`}
              className="text-primary font-semibold underline-offset-4 hover:underline"
            >
              {t(`names.${report}`)}
            </Link>
            <span className="text-muted-foreground text-[0.8125rem]">{t(`descriptions.${report}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
