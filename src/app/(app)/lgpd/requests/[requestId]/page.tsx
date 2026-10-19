import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/modules/identity/next";
import { privacy, RequestDetailView } from "@/modules/privacy";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { requestActions } from "../request-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("privacy.requests.detailTitle") };
}

// One LGPD request (design system 5.21): the request, its history and the action of its type.
export default async function LgpdRequestPage({ params }: PageProps<"/lgpd/requests/[requestId]">) {
  const t = await getTranslations();
  const ctx = await requirePermission("lgpd:manage");
  const { requestId } = await params;
  const detail = await privacy.getRequest(ctx, requestId);
  if (!detail.ok) notFound();

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("privacy.requests.detailTitle")}
        meta={`${t(`privacy.requests.types.${detail.value.type}`)} · ${detail.value.patient.displayName}`}
        breadcrumb={
          <Link href="/lgpd/requests" className="underline-offset-4 hover:underline">
            {t("privacy.requests.title")}
          </Link>
        }
      />
      <RequestDetailView detail={detail.value} actions={requestActions} />
    </div>
  );
}
