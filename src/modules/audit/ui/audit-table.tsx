"use client";

import { useTranslations } from "next-intl";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { AuditActorView, AuditEventItem } from "../application/views";

// The id prefix shown under the entity type (spec F15 assumption 9); the full id is in the panel.
const SHORT_ID = 8;

export function useAuditLabels() {
  const t = useTranslations("audit");
  return {
    action: (code: string) => (t.has(`actions.${code}`) ? t(`actions.${code}`) : code),
    entityType: (code: string | null) =>
      code ? (t.has(`entityTypes.${code}`) ? t(`entityTypes.${code}`) : code) : "",
    actor: (actor: AuditActorView) =>
      actor.type === "SYSTEM"
        ? t("actor.system")
        : actor.type === "ANONYMOUS"
          ? t("actor.anonymous")
          : actor.active
            ? (actor.name ?? actor.userId ?? "")
            : t("actor.inactive", { name: actor.name ?? actor.userId ?? "" }),
  };
}

// The result table (design system 5.4 and 5.19): Data e hora, Usuário, Ação as a stamp, Entidade and
// Resumo. A row opens the detail panel with a click or Enter; the open row carries the selected style.
export function AuditTable({
  items,
  timeZone,
  selectedId,
  onOpen,
  rowRef,
}: {
  items: AuditEventItem[];
  timeZone: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
  rowRef: (id: string, element: HTMLTableRowElement | null) => void;
}) {
  const t = useTranslations("audit.table");
  const labels = useAuditLabels();
  const format = useFormatters();
  return (
    <Table>
      <caption className="sr-only">{t("caption")}</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("occurredAt")}</TableHead>
          <TableHead scope="col">{t("user")}</TableHead>
          <TableHead scope="col">{t("action")}</TableHead>
          <TableHead scope="col">{t("entity")}</TableHead>
          <TableHead scope="col">{t("summary")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            ref={(element) => rowRef(item.id, element)}
            tabIndex={0}
            data-state={item.id === selectedId ? "selected" : undefined}
            aria-selected={item.id === selectedId}
            data-event-id={item.id}
            className="cursor-pointer"
            onClick={() => onOpen(item.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onOpen(item.id);
              }
            }}
          >
            <TableCell className="tabular-nums">{format.dateTime(item.occurredAt, timeZone)}</TableCell>
            <TableCell className={item.actor.active ? undefined : "text-muted-foreground"}>
              {labels.actor(item.actor)}
            </TableCell>
            <TableCell>
              <Stamp>{labels.action(item.action)}</Stamp>
            </TableCell>
            <TableCell>
              <div>{labels.entityType(item.entityType)}</div>
              {item.entityId ? (
                <div className="text-muted-foreground font-mono text-xs">
                  {item.entityId.slice(0, SHORT_ID)}
                </div>
              ) : null}
            </TableCell>
            <TableCell className="whitespace-normal">{item.summary}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
