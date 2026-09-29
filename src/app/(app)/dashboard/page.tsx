import type { Metadata } from "next";
import { requirePermission } from "@/modules/identity/next";
import { UnderConstruction } from "@/shared/ui/app-shell/under-construction";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage() {
  await requirePermission("dashboard:read");
  return <UnderConstruction title="Painel" feature="F12" />;
}
