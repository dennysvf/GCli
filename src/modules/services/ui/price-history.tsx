import { ArrowRight } from "lucide-react";
import { useLocale } from "next-intl";
import { formatLocale, formatMoney } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/locales";
import type { PriceChangeItem } from "../application/services";

// "Histórico de preços" tab (PRD F03 Experience): most recent change first.
export function PriceHistory({ changes, timeZone }: { changes: PriceChangeItem[]; timeZone: string }) {
  const locale = useLocale() as Locale;
  const money = (amountMinor: number, currency: PriceChangeItem["currency"]) =>
    formatMoney({ amountMinor, currency }, formatLocale(locale, null));
  if (changes.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhuma alteração de preço registrada.</p>;
  }
  const format = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone });
  return (
    <ol className="grid border-t" aria-label="Histórico de preços">
      {changes.map((change) => (
        <li key={change.id} className="grid gap-1 border-b py-3 text-sm">
          <div className="flex items-center gap-2 font-medium tabular-nums">
            {change.previousAmountMinor === null ? (
              <span>Preço inicial: {money(change.amountMinor, change.currency)}</span>
            ) : (
              <>
                <span className="text-muted-foreground">
                  {money(change.previousAmountMinor, change.currency)}
                </span>
                <ArrowRight className="size-3" aria-label="para" />
                <span>{money(change.amountMinor, change.currency)}</span>
              </>
            )}
          </div>
          <div className="text-muted-foreground text-xs">
            {format.format(new Date(change.changedAt))} · {change.changedBy?.name ?? "Sistema"}
          </div>
        </li>
      ))}
    </ol>
  );
}
