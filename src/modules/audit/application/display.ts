import { formatDate, formatDateTime, formatLocale, formatTime } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/locales";
import { createTranslator, type Translator } from "@/shared/i18n/translator";
import type { ValueDisplay } from "./present-changes";

// Labels and formats of the requester's language for the detail and the CSV (ADR-028). Codes that
// the catalog does not know (a type recorded by a newer module) are shown by their raw key.
export type AuditText = {
  t: Translator;
  display: ValueDisplay;
  action(code: string): string;
  entityType(code: string | null): string;
  actor(actor: { type: string; name: string | null; userId: string | null }): string;
  summary(row: { summary: string | null; action: string; entity_type: string | null }): string;
  date(instant: Date): string;
  time(instant: Date): string;
};

export function auditText(locale: Locale, timeZone: string): AuditText {
  const t = createTranslator(locale);
  const intl = formatLocale(locale);
  // An export labels the same few codes on every row, so each label is looked up once.
  const labels = new Map<string, string>();
  const known = (key: string, fallback: string) => {
    let label = labels.get(key);
    if (label === undefined) {
      label = t.has(key) ? t(key) : fallback;
      labels.set(key, label);
    }
    return label;
  };
  const action = (code: string) => known(`audit.actions.${code}`, code);
  const entityType = (code: string | null) => (code ? known(`audit.entityTypes.${code}`, code) : "");
  const system = t("audit.actor.system");
  const anonymous = t("audit.actor.anonymous");
  return {
    t,
    display: {
      label: (field) => known(`audit.fields.${field}`, field),
      yes: t("audit.values.yes"),
      no: t("audit.values.no"),
      empty: t("audit.values.empty"),
      hidden: t("audit.values.hidden"),
      anonymized: t("audit.values.anonymized"),
      instant: (iso) => formatDateTime(iso, intl, timeZone),
      sensitive: (before, after) => t("audit.values.sensitive", { before, after }),
    },
    action,
    entityType,
    actor: (actor) =>
      actor.type === "SYSTEM"
        ? system
        : actor.type === "ANONYMOUS"
          ? anonymous
          : (actor.name ?? actor.userId ?? ""),
    // Spec F15 assumption 7: the recorded summary, else "{action} · {entity type}".
    summary: (row) =>
      row.summary && row.summary.trim() !== ""
        ? row.summary
        : row.entity_type
          ? t("audit.summaryFallback", {
              action: action(row.action),
              entityType: entityType(row.entity_type),
            })
          : action(row.action),
    date: (instant) => formatDate(instant, intl, timeZone),
    time: (instant) => formatTime(instant, intl, timeZone, { seconds: true }),
  };
}
