import { recordDenial } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { formatLongDate } from "@/shared/i18n/calendar-names";
import { formatDateTime, formatLocale, formatTime } from "@/shared/i18n/format";
import { createTranslator } from "@/shared/i18n/translator";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { formatPhoneNumber } from "@/shared/kernel/phone";
import { parseInput } from "@/shared/kernel/validation";
import { localMinuteToUtc } from "@/shared/kernel/zoned-time";
import { SchedulingErrors } from "../domain/errors";
import { authorizeRead, canSee } from "./policies";
import type { SchedulingDeps } from "./ports";
import { toItems } from "./queries";
import { agendaPdfSchema } from "./schemas";

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Printable daily agenda of one professional in one unit (PRD F06 Full Scope, ADR-024). It lists
// patients, so every export is audited (architecture 5.3).
export async function exportDailyAgenda(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ fileName: string; bytes: Buffer }>> {
  const scope = await authorizeRead(ctx);
  if (!scope.ok) return scope;
  const parsed = parseInput(agendaPdfSchema, input);
  if (!parsed.ok) return parsed;
  const { unitId, date, professionalId } = parsed.value;
  if (!canSee(scope.value, { professionalId })) {
    await recordDenial(ctx, "schedule:read-all", professionalId);
    return fail(CommonErrors.forbidden());
  }
  const [organization, unit, people, allUnits] = await Promise.all([
    deps.directory.organization(ctx),
    deps.directory.unit(ctx, unitId),
    deps.directory.professionals(ctx, [professionalId]),
    deps.directory.listUnits(ctx),
  ]);
  const professional = people[0];
  if (!unit) return fail(SchedulingErrors.validation({ unitId: "scheduling.validation.unitNotFound" }));
  if (!professional)
    return fail(
      SchedulingErrors.validation({ professionalId: "scheduling.validation.professionalNotFound" }),
    );

  const filter = {
    unitId,
    professionalIds: [professionalId],
    from: localMinuteToUtc(date, 0, unit.timeZone),
    to: localMinuteToUtc(date, 1440, unit.timeZone),
    statuses: ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "NO_SHOW"] as const,
  };
  const listed = await withTransaction(ctx, async (uow) =>
    ok(await deps.appointments.list(uow, { ...filter, statuses: [...filter.statuses] }, null)),
  );
  if (!listed.ok) return listed;
  const items = await toItems(deps, ctx, listed.value.items, allUnits);
  const now = deps.clock();
  const t = createTranslator(ctx.locale);
  const intl = formatLocale(ctx.locale, unit.country);
  const timeOf = (iso: string) => formatTime(iso, intl, unit.timeZone);

  const bytes = await deps.pdf.render({
    clinicName: organization.name,
    logo: organization.logo,
    professionalName: professional.displayName,
    labels: {
      title: t("scheduling.pdf.title", { professional: professional.displayName }),
      subtitle: t("scheduling.pdf.subtitle", {
        unit: unit.name,
        date: formatLongDate(date, ctx.locale),
        count: items.length,
      }),
      generated: t("scheduling.pdf.generated", {
        at: formatDateTime(now, intl, unit.timeZone),
        user: ctx.user.name,
      }),
      page: t("scheduling.pdf.page", { page: "{page}", total: "{total}" }),
      empty: t("scheduling.pdf.empty"),
      columns: [
        t("scheduling.pdf.columns.time"),
        t("scheduling.pdf.columns.patient"),
        t("scheduling.pdf.columns.phone"),
        t("scheduling.pdf.columns.service"),
        t("scheduling.pdf.columns.room"),
        t("scheduling.pdf.columns.status"),
        t("scheduling.pdf.columns.notes"),
      ],
    },
    rows: items.map((item) => ({
      time: `${timeOf(item.startsAt)}–${timeOf(item.endsAt)}`,
      patient: item.patient.displayName,
      phone: item.patient.mobilePhone ? formatPhoneNumber(item.patient.mobilePhone, unit.country) : "",
      service: item.service.name,
      room: item.room?.name ?? "",
      status: t(`scheduling.ui.status.${item.status}`),
      notes: item.notes ?? "",
    })),
  });

  await withTransaction(ctx, async (uow) => {
    await uow.audit.record({
      action: "EXPORT",
      entityType: "professional",
      entityId: professionalId,
      summary: "Agenda diária em PDF",
      metadata: { unitId, date, count: items.length },
    });
    return ok(undefined);
  });
  return ok({ fileName: `agenda-${date}-${slugify(professional.displayName)}.pdf`, bytes });
}
