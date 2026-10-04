import Link from "next/link";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { cn } from "@/shared/ui/utils";
import type { ProfessionalListItem } from "../application/professionals";
import { ColorDot, ProfessionalAvatar } from "./professional-avatar";
import { useTranslations } from "next-intl";

// Professionals list (PRD F04 Experience): initials, name, specialty, units, number of services
// and status. A table with fine rules (design system 5.4); below 768 px each row is two lines.
export function ProfessionalsTable({
  items,
  search,
  canManage,
}: {
  items: ProfessionalListItem[];
  search?: string;
  canManage: boolean;
}) {
  const t = useTranslations();
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        {search
          ? t("professionals.ui.noneFoundFor", { term: search })
          : canManage
            ? t("professionals.ui.noProfessionalsHint")
            : t("professionals.ui.noProfessionals")}
      </p>
    );
  }

  return (
    <div className="border-y">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common.name")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("professionals.ui.specialty")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("common.units")}</TableHead>
            <TableHead className="hidden w-24 text-right md:table-cell">{t("common.services")}</TableHead>
            <TableHead className="w-24">{t("common.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className={cn(!item.active && "text-muted-foreground")}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <ProfessionalAvatar initials={item.initials} />
                  <div className="grid min-w-0">
                    <Link
                      href={`/settings/professionals/${item.id}`}
                      className="flex items-center gap-2 font-semibold underline-offset-4 hover:underline"
                    >
                      <ColorDot color={item.color} />
                      {item.displayName}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {[item.registration, item.specialty].filter(Boolean).join(" · ") || "—"}
                    </span>
                    <span className="text-muted-foreground text-xs md:hidden">
                      {item.unitNames.join(", ") || t("professionals.ui.noCurrentSchedule")} ·{" "}
                      {item.enabledServices}{" "}
                      {item.enabledServices === 1
                        ? t("professionals.ui.serviceSingular")
                        : t("professionals.ui.servicePlural")}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">{item.specialty ?? "—"}</TableCell>
              <TableCell className="hidden md:table-cell">
                {item.unitNames.length > 0
                  ? item.unitNames.join(", ")
                  : t("professionals.ui.noCurrentSchedule")}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {item.enabledServices}
              </TableCell>
              <TableCell>
                <Stamp variant={item.active ? "success" : "neutral"}>
                  {item.active ? t("common.active") : t("common.inactive")}
                </Stamp>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
