import { ArrowRight } from "lucide-react";
import { useLocale } from "next-intl";
import { formatLocale, formatMoney } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/locales";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { PriceChangeItem } from "../application/services";
import { useTranslations } from "next-intl";

// "Histórico de preços" tab (PRD F03 Experience): most recent change first.
export function PriceHistory({ changes, timeZone }: { changes: PriceChangeItem[]; timeZone: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const format = useFormatters();
  const money = (amountMinor: number, currency: PriceChangeItem["currency"]) =>
    formatMoney({ amountMinor, currency }, formatLocale(locale, null));
  if (changes.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("services.ui.noPriceChanges")}</p>;
  }
  return (
    <ol className="grid border-t" aria-label={t("services.ui.priceHistory")}>
      {changes.map((change) => (
        <li key={change.id} className="grid gap-1 border-b py-3 text-sm">
          <div className="flex items-center gap-2 font-medium tabular-nums">
            {change.previousAmountMinor === null ? (
              <span>
                {t("services.ui.initialPrice")} {money(change.amountMinor, change.currency)}
              </span>
            ) : (
              <>
                <span className="text-muted-foreground">
                  {money(change.previousAmountMinor, change.currency)}
                </span>
                <ArrowRight className="size-3" aria-label={t("services.ui.changedTo")} />
                <span>{money(change.amountMinor, change.currency)}</span>
              </>
            )}
          </div>
          <div className="text-muted-foreground text-xs">
            {format.dateTime(change.changedAt, timeZone)} ·{" "}
            {change.changedBy
              ? (change.changedBy.name ?? t("services.ui.removedUser"))
              : t("services.ui.system")}
          </div>
        </li>
      ))}
    </ol>
  );
}
