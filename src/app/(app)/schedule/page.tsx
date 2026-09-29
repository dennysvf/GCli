import type { Metadata } from "next";
import { requirePermission } from "@/modules/identity/next";
import { UnderConstruction } from "@/shared/ui/app-shell/under-construction";

export const metadata: Metadata = { title: "Agenda" };

export default async function SchedulePage() {
  await requirePermission("schedule:read-all", "schedule:read-own");
  return <UnderConstruction title="Agenda" feature="F06" />;
}
