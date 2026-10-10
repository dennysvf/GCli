"use client";

import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/components/tooltip";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { Change } from "../domain/kpis";

// The variation of a value (design system 5.17): always written with its sign; the arrow and the
// color appear only when the change is significant, and the color follows the meaning of the KPI.
export function ChangeText({ change }: { change: Change }) {
  const t = useTranslations("analytics.change");
  const format = useFormatters();
  if (change.kind === "NO_BASE") return <span className="text-muted-foreground">{t("noBase")}</span>;
  if (change.kind === "NONE" || change.value === null)
    return <span className="text-muted-foreground">{t("none")}</span>;
  const signed =
    change.kind === "PERCENT"
      ? format.number(change.value, { signDisplay: "exceptZero", maximumFractionDigits: 0 })
      : format.number(change.value, {
          signDisplay: "exceptZero",
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
  const text = change.kind === "PERCENT" ? t("percent", { value: signed }) : t("points", { value: signed });
  const highlighted = change.significant && change.tone !== "NEUTRAL";
  const Arrow = change.value > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        !highlighted && "text-muted-foreground",
        highlighted && change.tone === "GOOD" && "text-success",
        highlighted && change.tone === "BAD" && "text-destructive",
      )}
    >
      {highlighted ? <Arrow aria-hidden className="size-3.5" /> : null}
      {text}
    </span>
  );
}

// A dashboard indicator (design system 5.6 and 5.17): label with the formula tooltip, the value in
// `figure` and the variation in `meta`.
export function KpiCard({
  id,
  label,
  formula,
  children,
}: {
  id: string;
  label: string;
  formula: string;
  children: ReactNode;
}) {
  const t = useTranslations("analytics.ui");
  const labelId = `kpi-${id}`;
  return (
    <section
      aria-labelledby={labelId}
      className="bg-paper-0 border-rule grid content-start gap-2 rounded-lg border p-4"
      data-kpi={id}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 id={labelId} className="column-label text-muted-foreground">
          {label}
        </h3>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -m-1 rounded p-1 focus-visible:ring-2 focus-visible:outline-none"
              aria-label={t("formulaOf", { label })}
            >
              <Info aria-hidden className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{formula}</TooltipContent>
        </Tooltip>
      </div>
      {children}
    </section>
  );
}

// One value line of a card: the number and its variation.
export function KpiValue({
  value,
  change,
  primary = true,
}: {
  value: string;
  change: Change | null;
  primary?: boolean;
}) {
  return (
    <div className="grid gap-0.5">
      <p className={primary ? "figure" : "text-[0.9375rem] leading-[1.375rem] font-semibold tabular-nums"}>
        {value}
      </p>
      {change ? (
        <p className="text-[0.8125rem] leading-[1.125rem]">
          <ChangeText change={change} />
        </p>
      ) : null}
    </div>
  );
}
