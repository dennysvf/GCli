import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationProfile } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import {
  CategoriesDialog,
  ServicesFilters,
  ServiceSheet,
  ServicesTable,
  services,
  type PriceChangeItem,
  type ServiceColor,
  type ServiceDetails,
} from "@/modules/services";
import { units } from "@/modules/units";
import { can } from "@/shared/authz/permissions";
import { Button } from "@/shared/ui/components/button";
import {
  createCategoryAction,
  deleteCategoryAction,
  moveCategoryAction,
  renameCategoryAction,
  saveServiceAction,
  setServiceActiveAction,
} from "./actions";

export const metadata: Metadata = { title: "Serviços" };

const FALLBACK_TIME_ZONE = "America/Sao_Paulo";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ServicesPage({ searchParams }: PageProps<"/settings/services">) {
  const ctx = await requirePermission("setup:read");
  const params = await searchParams;
  const canManage = can(ctx, "setup:manage");
  const opened = single(params.service);
  const filters = {
    search: single(params.q),
    categoryId: single(params.category),
    status: single(params.status),
  };

  const [list, categories] = await Promise.all([
    services.listServices(ctx, filters),
    services.listCategories(ctx),
  ]);
  if (!list.ok || !categories.ok) notFound();
  const categoryOptions = categories.value.map(({ id, name }) => ({ id, name }));

  // Side panel data, loaded only when a service (or "new") is open.
  let service: ServiceDetails | null = null;
  let history: PriceChangeItem[] = [];
  let defaultColor: ServiceColor = "blue";
  if (opened && opened !== "new") {
    const [found, changes] = await Promise.all([
      services.getService(ctx, opened),
      services.listPriceHistory(ctx, opened),
    ]);
    if (!found.ok) notFound();
    service = found.value;
    history = changes.ok ? changes.value : [];
  } else if (opened === "new") {
    if (!canManage) notFound();
    const suggested = await services.suggestServiceColor(ctx);
    if (suggested.ok) defaultColor = suggested.value;
  }
  const [rooms, profile] = opened
    ? await Promise.all([units.getRooms(ctx, { activeOnly: true }), getOrganizationProfile(ctx)])
    : [null, null];

  const query = new URLSearchParams(
    Object.entries({ q: filters.search, category: filters.categoryId, status: filters.status }).flatMap(
      ([key, value]) => (value ? [[key, value]] : []),
    ),
  ).toString();

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Serviços</h1>
        {canManage ? (
          <div className="flex gap-2">
            <CategoriesDialog
              categories={categories.value}
              actions={{
                create: createCategoryAction,
                rename: renameCategoryAction,
                move: moveCategoryAction,
                remove: deleteCategoryAction,
              }}
            />
            <Button asChild>
              <Link
                href={`?${new URLSearchParams([...new URLSearchParams(query), ["service", "new"]])}`}
                scroll={false}
              >
                <Plus />
                Novo serviço
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
      <ServicesFilters
        categories={categoryOptions}
        search={list.value.filters.search}
        categoryId={list.value.filters.categoryId}
        status={list.value.filters.status}
      />
      <ServicesTable groups={list.value.groups} query={query} />
      {opened ? (
        <ServiceSheet
          service={service}
          history={history}
          categories={categoryOptions}
          rooms={rooms?.ok ? rooms.value : []}
          defaultColor={defaultColor}
          timeZone={profile?.ok ? profile.value.timeZone : FALLBACK_TIME_ZONE}
          canManage={canManage}
          actions={{
            save: saveServiceAction,
            setActive: setServiceActiveAction,
            createCategory: createCategoryAction,
          }}
        />
      ) : null}
    </div>
  );
}
