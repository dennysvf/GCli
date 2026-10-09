import { cash, EntriesView } from "@/modules/cash";
import { requirePermission } from "@/modules/identity/next";
import { units } from "@/modules/units";
import { addDays, addMonths } from "@/shared/kernel/calendar-date";
import { countryProfile } from "@/shared/kernel/countries";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { financeActions } from "./finance-actions";

// Shared by Financeiro > Despesas and > Receitas (PRD F11): the entries of the current month in the
// reference zone, with every active unit and the methods each unit country allows.
export async function EntriesPage({ kind }: { kind: "EXPENSE" | "REVENUE" }) {
  const ctx = await requirePermission("finance:manage");
  const [unitList, categories] = await Promise.all([
    units.listUnits(ctx, { activeOnly: true }),
    cash.listCategories(ctx),
  ]);
  const activeUnits = unitList.ok ? unitList.value : [];
  const timeZone = activeUnits[0]?.timeZone ?? "UTC";
  const first = `${dateInTimeZone(new Date(), timeZone).slice(0, 8)}01`;
  const to = addDays(addMonths(first, 1), -1);
  const list = await cash.listEntries(ctx, { kind, from: first, to });

  const methodsFor: Record<string, string[]> = {
    GENERAL: [...countryProfile(ctx.organizationCountry).paymentMethods],
  };
  for (const unit of activeUnits) methodsFor[unit.id] = [...countryProfile(unit.country).paymentMethods];

  return (
    <EntriesView
      kind={kind}
      initial={list.ok ? list.value : { entries: [], today: first }}
      initialFilters={{ from: first, to }}
      units={activeUnits.map((unit) => ({ id: unit.id, name: unit.name, currency: unit.currency }))}
      categories={categories.ok ? categories.value : []}
      methodsFor={methodsFor}
      actions={financeActions}
    />
  );
}
