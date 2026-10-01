import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { listLinkableUsers } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import {
  ProfessionalActiveToggle,
  ProfessionalForm,
  professionals,
  ScheduleEditor,
  ServicesChecklist,
  TimeOffsPanel,
} from "@/modules/professionals";
import { formatDuration, services } from "@/modules/services";
import { can } from "@/shared/authz/permissions";
import { formatCents } from "@/shared/kernel/money";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { Stamp } from "@/shared/ui/components/stamp";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/components/tabs";
import {
  createTimeOffAction,
  deleteScheduleAction,
  deleteTimeOffAction,
  replaceEnabledServicesAction,
  saveProfessionalAction,
  saveScheduleAction,
  setProfessionalActiveAction,
} from "../actions";
import { ROLE_LABELS } from "../role-labels";

export const metadata: Metadata = { title: "Profissional" };

const TABS = ["data", "services", "schedule", "time-offs"] as const;

export default async function ProfessionalPage({
  params,
  searchParams,
}: PageProps<"/settings/professionals/[professionalId]">) {
  const ctx = await requirePermission("professional:read");
  const { professionalId } = await params;
  const query = await searchParams;
  const activeTab = TABS.find((value) => value === query.tab) ?? "data";
  const showEnded = query.ended === "1";

  const professional = await professionals.getProfessional(ctx, professionalId);
  if (!professional.ok) {
    // getProfessional already recorded the denial (PRD F01: 403 page).
    if (professional.error.code === "AUTHZ_FORBIDDEN") forbidden();
    notFound();
  }
  const details = professional.value;
  const canManage = can(ctx, "professional:manage");
  const readOnly = !canManage || !details.active;

  const [users, activeServices, enabled, schedules, timeOffs] = await Promise.all([
    canManage ? listLinkableUsers(ctx) : Promise.resolve([]),
    services.listActiveServices(ctx),
    professionals.getEnabledServices(ctx, professionalId),
    professionals.listSchedules(ctx, professionalId),
    professionals.listTimeOffs(ctx, professionalId, { includeEnded: showEnded }),
  ]);
  const timeZone = timeOffs.ok ? timeOffs.value.timeZone : "America/Sao_Paulo";
  const today = dateInTimeZone(new Date(), timeZone);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={details.displayName ?? details.fullName}
        titleAddon={
          <Stamp variant={details.active ? "success" : "neutral"}>
            {details.active ? "Ativo" : "Inativo"}
          </Stamp>
        }
        meta={[details.specialty, details.registration].filter(Boolean).join(" · ") || undefined}
        breadcrumb={
          <Link href="/settings/professionals" className="underline-offset-4 hover:underline">
            Profissionais
          </Link>
        }
        actions={
          canManage ? (
            <ProfessionalActiveToggle
              professionalId={professionalId}
              active={details.active}
              appointmentsHref={`/schedule?view=list&professional=${professionalId}&from=${today}`}
              action={setProfessionalActiveAction}
            />
          ) : null
        }
      />
      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="data">Dados</TabsTrigger>
          <TabsTrigger value="services">Serviços</TabsTrigger>
          <TabsTrigger value="schedule">Horários</TabsTrigger>
          <TabsTrigger value="time-offs">Ausências</TabsTrigger>
        </TabsList>
        <TabsContent value="data" className="pt-4">
          <ProfessionalForm
            professional={details}
            defaultColor={details.color}
            linkableUsers={users.map((user) => ({
              id: user.id,
              name: user.name,
              email: user.email,
              roleLabel: ROLE_LABELS[user.role] ?? user.role,
            }))}
            readOnly={readOnly}
            action={saveProfessionalAction}
          />
        </TabsContent>
        <TabsContent value="services" className="pt-4">
          <ServicesChecklist
            professionalId={professionalId}
            version={details.version}
            services={(activeServices.ok ? activeServices.value : []).map((service) => ({
              id: service.id,
              name: service.name,
              categoryName: service.categoryName,
              color: service.color,
              details: `${formatDuration(service.durationMinutes)} · ${formatCents(service.priceCents)}`,
            }))}
            enabledIds={enabled.ok ? enabled.value.serviceIds : []}
            inactiveServices={enabled.ok ? enabled.value.inactiveServices : []}
            readOnly={readOnly}
            action={replaceEnabledServicesAction}
          />
        </TabsContent>
        <TabsContent value="schedule" className="pt-4">
          {schedules.ok ? (
            <ScheduleEditor
              professionalId={professionalId}
              today={schedules.value.today}
              schedules={schedules.value.schedules}
              units={schedules.value.units.filter((unit) => unit.active)}
              readOnly={readOnly}
              actions={{ save: saveScheduleAction, remove: deleteScheduleAction }}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="time-offs" className="pt-4">
          {timeOffs.ok ? (
            <TimeOffsPanel
              professionalId={professionalId}
              timeZone={timeZone}
              items={timeOffs.value.items}
              canManage={timeOffs.value.canManage && details.active}
              showingEnded={showEnded}
              today={today}
              actions={{ create: createTimeOffAction, remove: deleteTimeOffAction }}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
