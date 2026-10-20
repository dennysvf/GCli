"use client";

import { useTranslations } from "next-intl";
import { Stamp, type StampVariant } from "@/shared/ui/components/stamp";
import type { RequestStatus } from "../domain/lgpd-request";

// Request statuses as stamps (design system 5.21): always written, the tone only reinforces.
const TONES: Record<RequestStatus, StampVariant> = {
  PENDING: "neutral",
  PROCESSING: "info",
  FAILED: "danger",
  COMPLETED: "success",
  LEGAL_RETENTION: "warning",
};

export function RequestStatusStamp({ status }: { status: RequestStatus }) {
  const t = useTranslations();
  return <Stamp variant={TONES[status]}>{t(`privacy.requests.statuses.${status}`)}</Stamp>;
}

// PRD F14: requests pending for more than 15 days are highlighted, with the days written.
export function OverdueStamp({ days }: { days: number }) {
  const t = useTranslations();
  return <Stamp variant="warning">{t("privacy.requests.overdue", { days })}</Stamp>;
}
