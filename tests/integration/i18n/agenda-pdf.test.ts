import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduling } from "@/modules/scheduling";
import { formatLongDate } from "@/shared/i18n/calendar-names";
import type { Locale } from "@/shared/i18n/locales";
import { closeHelpers, resetDatabase } from "../helpers";
import { booking, bookOrThrow, day, schedulingWorld, type World } from "../scheduling/support";

// The PDF engine is replaced by one that returns the document it receives: the texts of the page
// are what this test checks, not the PDF bytes (those are covered by the F06 export test).
vi.mock("@/modules/scheduling/infrastructure/agenda-pdf-document", () => ({
  renderDailyAgenda: async (document: unknown) => Buffer.from(JSON.stringify(document)),
}));

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: World;
beforeEach(async () => {
  world = await schedulingWorld();
});

type Page = {
  labels: {
    title: string;
    subtitle: string;
    generated: string;
    page: string;
    empty: string;
    columns: string[];
  };
  rows: { status: string; time: string }[];
};

async function exportIn(locale: Locale): Promise<Page> {
  const result = await scheduling.exportDailyAgenda(
    { ...world.desk, locale },
    { unitId: world.unitId, date: day(7), professionalId: world.professionals.ana },
  );
  if (!result.ok) throw new Error(result.error.code);
  return JSON.parse(result.value.bytes.toString("utf-8")) as Page;
}

describe("agenda PDF language", () => {
  it("F16→F06: the daily agenda PDF is written in the language of the requester", async () => {
    await bookOrThrow(world.desk, booking(world));

    const pt = await exportIn("pt-BR");
    expect(pt.labels.title).toBe("Agenda de Dra. Ana");
    expect(pt.labels.columns[0]).toBe("Horário");
    expect(pt.labels.page).toBe("Página {page} de {total}");
    expect(pt.rows[0]?.status).toBe("Agendado");
    expect(pt.labels.subtitle).toContain(formatLongDate(day(7), "pt-BR"));

    const en = await exportIn("en");
    expect(en.labels.title).toBe("Agenda of Dra. Ana");
    expect(en.labels.columns[0]).toBe("Time");
    expect(en.labels.page).toBe("Page {page} of {total}");
    expect(en.rows[0]?.status).toBe("Scheduled");
    expect(en.labels.subtitle).toContain(formatLongDate(day(7), "en"));
    expect(en.labels.subtitle).toContain("1 appointments");

    const es = await exportIn("es");
    expect(es.labels.title).toBe("Agenda de Dra. Ana");
    expect(es.labels.columns[0]).toBe("Horario");
    expect(es.rows[0]?.status).toBe("Programada");
    expect(es.labels.empty).toBe("No hay citas este día.");
  });
});
