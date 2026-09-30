import { ArrowRight } from "lucide-react";
import { formatCents } from "@/shared/kernel/money";
import type { PriceChangeItem } from "../application/services";

// "Histórico de preços" tab (PRD F03 Experience): most recent change first.
export function PriceHistory({ changes, timeZone }: { changes: PriceChangeItem[]; timeZone: string }) {
  if (changes.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhuma alteração de preço registrada.</p>;
  }
  const format = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone });
  return (
    <ol className="grid gap-3" aria-label="Histórico de preços">
      {changes.map((change) => (
        <li key={change.id} className="grid gap-1 rounded-lg border p-3 text-sm">
          <div className="flex items-center gap-2 font-medium tabular-nums">
            {change.previousPriceCents === null ? (
              <span>Preço inicial: {formatCents(change.priceCents)}</span>
            ) : (
              <>
                <span className="text-muted-foreground">{formatCents(change.previousPriceCents)}</span>
                <ArrowRight className="size-3" aria-label="para" />
                <span>{formatCents(change.priceCents)}</span>
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
