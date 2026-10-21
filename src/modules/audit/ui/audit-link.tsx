"use client";

import { HistoryIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/components/button";

// The viewer URL filtered by one entity (spec F15 section 5, URL contract). Without dates the page
// opens the last 366 days, so the helper never has to know "today" in the organization's zone.
export function auditHref(entityType: string, entityId: string): string {
  return `/settings/audit?${new URLSearchParams({ entityType, entityId }).toString()}`;
}

// "Ver auditoria" (PRD F15, design system 5.19). Rendered by the host screens only for users who may
// read the audit log; the page and its endpoints check the permission again.
export function AuditLink({
  entityType,
  entityId,
  variant = "secondary",
  size = "default",
}: {
  entityType: string;
  entityId: string;
  variant?: "secondary" | "ghost";
  size?: "default" | "sm";
}) {
  const t = useTranslations("audit.link");
  return (
    <Button asChild variant={variant} size={size}>
      <Link href={auditHref(entityType, entityId)}>
        <HistoryIcon aria-hidden="true" />
        {t("label")}
      </Link>
    </Button>
  );
}
