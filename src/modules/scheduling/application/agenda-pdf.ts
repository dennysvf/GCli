import { recordDenial } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { formatDateBR } from "@/shared/kernel/calendar-date";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { formatPhone } from "@/shared/kernel/phone";
import { parseInput } from "@/shared/kernel/validation";
import { localMinuteToUtc, utcToZonedParts } from "@/shared/kernel/zoned-time";
import { localTime } from "../domain/agenda-time";
import { SchedulingErrors } from "../domain/errors";
import { STATUS_LABELS } from "../domain/status";
import { authorizeRead, canSee } from "./policies";
import type { SchedulingDeps } from "./ports";
import { toItems } from "./queries";
import { agendaPdfSchema } from "./schemas";

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

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
  if (!unit) return fail(SchedulingErrors.validation({ unitId: "Unidade não encontrada." }));
  if (!professional)
    return fail(SchedulingErrors.validation({ professionalId: "Profissional não encontrado." }));

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
  const nowLocal = utcToZonedParts(now, unit.timeZone);
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? "";

  const bytes = await deps.pdf.render({
    clinicName: organization.name,
    logo: organization.logo,
    professionalName: professional.displayName,
    unitName: unit.name,
    dateLabel: `${weekday}, ${formatDateBR(date)}`,
    generatedLabel: `Gerado em ${formatDateBR(nowLocal.date)} ${localTime(now, unit.timeZone)} por ${ctx.user.name}`,
    rows: items.map((item) => ({
      time: `${localTime(new Date(item.startsAt), unit.timeZone)}–${localTime(new Date(item.endsAt), unit.timeZone)}`,
      patient: item.patient.displayName,
      phone: item.patient.mobilePhone ? formatPhone(item.patient.mobilePhone) : "",
      service: item.service.name,
      room: item.room?.name ?? "",
      status: STATUS_LABELS[item.status],
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
