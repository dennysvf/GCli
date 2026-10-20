"use client";

import { useLocale } from "next-intl";
import { formatLocale } from "@/shared/i18n/format";
import { isLocale } from "@/shared/i18n/locales";
import type { TimelineItem } from "../application/ports";
import type { TimelineActions } from "./timeline-actions";
import { TimelineEvent } from "./timeline-item";

// The events under month headings (design system 5.20): a vertical list with a fine rule along its
// left edge, newest first.

function monthKey(item: TimelineItem): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: item.timeZone,
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(new Date(item.occurredAt))
    .reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}`;
}

function monthLabel(key: string, locale: string): string {
  const [year = "2000", month = "01"] = key.split("-");
  const text = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(year), Number(month) - 1, 15)),
  );
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

export function TimelineList({
  items,
  patientId,
  openNote,
}: {
  items: TimelineItem[];
  patientId: string;
  openNote: TimelineActions["openNote"];
}) {
  const current = useLocale();
  const locale = formatLocale(isLocale(current) ? current : "pt-BR", null);
  const months: { key: string; items: TimelineItem[] }[] = [];
  for (const item of items) {
    const key = monthKey(item);
    const last = months.at(-1);
    if (last && last.key === key) last.items.push(item);
    else months.push({ key, items: [item] });
  }
  return (
    <div className="grid gap-6">
      {months.map((month) => (
        <section key={month.key} className="grid gap-3">
          <h3 className="group-title">{monthLabel(month.key, locale)}</h3>
          <ol className="border-border grid border-l pl-0">
            {month.items.map((item) => (
              <TimelineEvent key={item.key} item={item} patientId={patientId} openNote={openNote} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
