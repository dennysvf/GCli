import Link from "next/link";
import { useLocale } from "next-intl";
import { formatLocale, formatMoney } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/locales";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { cn } from "@/shared/ui/utils";
import type { ServiceGroup } from "../application/services";
import { formatDuration } from "../domain/service-rules";
import { PALETTE } from "@/shared/ui/palette/palette";
import { useTranslations } from "next-intl";

// Services grouped by category (PRD F03 Experience). Each row opens the side panel through the
// ?service= query, keeping the current filters.
export function ServicesTable({ groups, query }: { groups: ServiceGroup[]; query: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  if (groups.length === 0) {
    return <p className="text-muted-foreground">{t("services.ui.noServicesFound")}</p>;
  }
  const hrefFor = (serviceId: string) => {
    const params = new URLSearchParams(query);
    params.set("service", serviceId);
    return `?${params.toString()}`;
  };

  return (
    <div className="grid gap-6">
      {groups.map(({ category, services }) => (
        <section key={category.id} aria-labelledby={`category-${category.id}`} className="grid gap-2">
          <h2 id={`category-${category.id}`} className="text-sm font-semibold">
            {category.name}{" "}
            <span className="text-muted-foreground text-xs font-normal">({services.length})</span>
          </h2>
          {services.length === 0 ? (
            <p className="text-muted-foreground border-y py-3 text-sm">
              {t("services.ui.noServicesInCategory")}
            </p>
          ) : (
            <div className="border-y">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead className="w-28">{t("services.ui.duration")}</TableHead>
                    <TableHead className="w-32 text-right">{t("services.ui.price")}</TableHead>
                    <TableHead className="w-28 text-right">{t("common.professionals")}</TableHead>
                    <TableHead className="w-24">{t("common.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service) => (
                    <TableRow key={service.id} className={cn(!service.active && "text-muted-foreground")}>
                      <TableCell>
                        <Link
                          href={hrefFor(service.id)}
                          scroll={false}
                          className="flex items-center gap-2 font-medium underline-offset-4 hover:underline"
                        >
                          <span
                            className={cn("size-3 shrink-0 rounded-full", PALETTE[service.color].swatch)}
                            aria-hidden
                          />
                          {service.name}
                        </Link>
                      </TableCell>
                      <TableCell>{formatDuration(service.durationMinutes)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {service.prices.length === 0
                          ? "—"
                          : service.prices.map((price) => (
                              <div key={price.currency}>{formatMoney(price, formatLocale(locale, null))}</div>
                            ))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {service.enabledProfessionals}
                      </TableCell>
                      <TableCell>
                        <Stamp variant={service.active ? "success" : "neutral"}>
                          {service.active ? t("common.active") : t("common.inactive")}
                        </Stamp>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
