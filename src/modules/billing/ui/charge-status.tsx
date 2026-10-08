"use client";

import { useTranslations } from "next-intl";
import { Stamp, type StampVariant } from "@/shared/ui/components/stamp";
import type { ChargeStatus } from "../domain/status";

// The status is always written (design system 5.14), with the tone of its meaning.
const TONES: Record<ChargeStatus, StampVariant> = {
  PENDING_APPROVAL: "warning",
  OPEN: "neutral",
  PARTIALLY_PAID: "info",
  PAID: "success",
  CANCELLED: "cancelled",
};

export function ChargeStatusStamp({ status }: { status: ChargeStatus }) {
  const t = useTranslations("billing.status");
  return <Stamp variant={TONES[status]}>{t(status)}</Stamp>;
}
