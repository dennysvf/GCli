import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/modules/identity/next";
import { privacy, REQUEST_STATUSES, REQUEST_TYPES, RequestsView } from "@/modules/privacy";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { requestActions } from "./request-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("privacy.requests.title") };
}

function pick(value: string | string[] | undefined, allowed: readonly string[], fallback: string): string {
  const text = Array.isArray(value) ? value[0] : value;
  return text && allowed.includes(text) ? text : fallback;
}

// LGPD > Solicitações (PRD F14 Experience): the register, for Administrators only (lgpd:manage).
export default async function LgpdRequestsPage({ searchParams }: PageProps<"/lgpd/requests">) {
  const t = await getTranslations();
  const ctx = await requirePermission("lgpd:manage");
  const params = await searchParams;
  const status = pick(params.status, ["OPEN", "ALL", ...REQUEST_STATUSES], "OPEN");
  const type = pick(params.type, ["ALL", ...REQUEST_TYPES], "ALL");
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const list = await privacy.listRequests(ctx, { status, type, page });

  return (
    <div className="grid gap-6">
      <PageHeader title={t("privacy.requests.title")} meta={t("privacy.requests.hint")} />
      <RequestsView
        list={
          list.ok
            ? list.value
            : { items: [], page: 1, pageSize: 50, total: 0, openOverdueCount: 0, organizationTimeZone: "UTC" }
        }
        filters={{ status, type }}
        actions={requestActions}
      />
    </div>
  );
}
