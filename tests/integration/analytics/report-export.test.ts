import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getOrganizationProfile, identity } from "@/modules/identity";
import { readPdf } from "../../pdf-reader";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import {
  addDays,
  billingWorld,
  controlledDataset,
  custom,
  day,
  freshReports,
  insertAppointment,
  readBody,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

const BOM = String.fromCharCode(0xfeff);

async function exportCsv(input: Record<string, unknown>, id = "appointments", ctx = world.manager) {
  const exported = await freshReports().api.exportReport(ctx, id, "csv", input);
  if (!exported.ok) throw new Error(`export failed: ${exported.error.code}`);
  return { ...exported.value, text: await readBody(exported.value.body) };
}

describe("CSV export", () => {
  it("F13: CSV starts with a BOM and uses semicolon and decimal comma in pt-BR, with a currency column", async () => {
    const period = await controlledDataset(world);
    const { text, rowCount, contentType, fileName } = await exportCsv(custom(period));
    expect(contentType).toContain("text/csv");
    expect(rowCount).toBe(9);
    expect(fileName).toBe(`agendamentos-${period.from}-${period.to}.csv`);
    expect(text.startsWith(BOM)).toBe(true);
    const lines = text.slice(1).trim().split("\r\n");
    expect(lines).toHaveLength(10);
    expect(lines[0]).toBe("Data;Horário;Paciente;Serviço;Profissional;Unidade;Sala;Status;Preço;Moeda");
    // Each row has the price as a plain number with a decimal comma, then the currency.
    expect(lines.slice(1).every((line) => /;250,00;(BRL|EUR)$/.test(line))).toBe(true);
    expect(lines.filter((line) => line.endsWith(";EUR"))).toHaveLength(1);
  });

  it("F13: CSV uses comma and decimal point in en and the semicolon in es", async () => {
    const period = await controlledDataset(world);
    const en = await exportCsv(custom(period), "appointments", { ...world.manager, locale: "en" });
    const enLines = en.text.slice(1).trim().split("\r\n");
    expect(enLines[0]).toBe("Date,Time,Patient,Service,Professional,Unit,Room,Status,Price,Currency");
    expect(enLines[1]).toMatch(/,250\.00,BRL$/);
    const es = await exportCsv(custom(period), "appointments", { ...world.manager, locale: "es" });
    const esLines = es.text.slice(1).trim().split("\r\n");
    expect(esLines[0]?.split(";")).toHaveLength(10);
    expect(esLines[1]).toMatch(/;250,00;BRL$/);
  });

  it("F13: every report exports its rows and the CSV row count matches the screen total", async () => {
    const period = await controlledDataset(world);
    const { api } = freshReports();
    for (const id of ["appointments", "cancellations", "revenue", "receivables", "productivity"]) {
      const view = await api.getReport(world.manager, id, custom(period));
      if (!view.ok) throw new Error(view.error.code);
      const { text } = await exportCsv(custom(period), id);
      expect(text.slice(1).trim().split("\r\n").length - 1).toBe(view.value.totals.rowCount);
    }
  });

  it("F13: CSV rows come in date order", async () => {
    for (let index = 0; index < 5; index += 1) {
      await insertAppointment(world, {
        date: addDays("2027-03-01", index),
        time: "09:00",
        minutes: 30,
        status: "SCHEDULED",
      });
    }
    const { text } = await exportCsv(custom({ from: "2027-03-01", to: "2027-03-10" }));
    const dates = text
      .slice(1)
      .trim()
      .split("\r\n")
      .slice(1)
      .map((line) => line.split(";")[0]);
    expect(dates).toEqual(["01/03/2027", "02/03/2027", "03/03/2027", "04/03/2027", "05/03/2027"]);
  });
});

describe("export audit", () => {
  it("F13: every CSV and PDF export records an audit event with the report, format, filters and row count", async () => {
    const period = await controlledDataset(world);
    const { api } = freshReports();
    const csv = await api.exportReport(
      world.manager,
      "cancellations",
      "csv",
      custom(period, { type: "NO_SHOW" }),
    );
    if (!csv.ok) throw new Error(csv.error.code);
    await readBody(csv.value.body);
    const pdf = await api.exportReport(world.admin, "revenue", "pdf", custom(period));
    if (!pdf.ok) throw new Error(pdf.error.code);

    const events = await auditEvents({ action: "EXPORT" });
    const reports = events.filter((event) => event.entityType === "report");
    expect(reports).toHaveLength(2);
    const metadata = reports.map((event) => event.metadata as Record<string, unknown>);
    expect(metadata).toContainEqual(
      expect.objectContaining({
        report: "cancellations",
        format: "csv",
        rows: 1,
        filters: expect.objectContaining({ type: "NO_SHOW", from: period.from, to: period.to }),
      }),
    );
    expect(metadata).toContainEqual(expect.objectContaining({ report: "revenue", format: "pdf", rows: 6 }));
  });

  it("F13: a refused export records no audit event", async () => {
    const result = await freshReports().api.exportReport(
      world.manager,
      "appointments",
      "csv",
      custom({ from: "2020-01-01", to: "2026-01-01" }),
    );
    expect(result.ok).toBe(false);
    expect(
      (await auditEvents({ action: "EXPORT" })).filter((event) => event.entityType === "report"),
    ).toHaveLength(0);
  });
});

describe("PDF export", () => {
  it("F13: PDF header has the organization name, the report name and the applied filters, and the footer has the date, the user and the page label", async () => {
    const period = await controlledDataset(world);
    const profile = await getOrganizationProfile(world.manager);
    if (!profile.ok) throw new Error(profile.error.code);
    const { api, documents } = freshReports();
    const exported = await api.exportReport(
      world.manager,
      "appointments",
      "pdf",
      custom(period, { status: "NO_SHOW", unit: world.unitId }),
    );
    if (!exported.ok) throw new Error(exported.error.code);
    const document = documents[0];
    expect(document?.clinicName).toBe(profile.value.tradeName ?? profile.value.legalName);
    expect(document?.title).toBe("Agendamentos");
    expect(document?.subtitle).toContain("Período:");
    expect(document?.subtitle).toContain("Status: Faltou");
    expect(document?.subtitle).toContain("Unidade:");
    expect(document?.generated).toContain(world.manager.user.name);
    expect(document?.pageLabel).toBe("Página {page} de {total}");
    expect(document?.rows).toHaveLength(1);
    expect(document?.totalsRow?.[0]).toBe("Total: 1 linha");
    expect(exported.value.fileName.endsWith(".pdf")).toBe(true);
  });

  it("F13: the real renderer produces an A4 landscape PDF", async () => {
    const period = await controlledDataset(world);
    const { api } = freshReports({ realPdf: true });
    const exported = await api.exportReport(world.manager, "cancellations", "pdf", custom(period));
    if (!exported.ok) throw new Error(exported.error.code);
    const bytes = Buffer.from(exported.value.body as Buffer);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(bytes.toString("latin1"));
    expect(Number(box?.[1])).toBeGreaterThan(Number(box?.[2]));
  });

  it("F13: the real PDF has the organization logo in the header and real page numbers on every page", async () => {
    // Sixty appointments over three days: more rows than one landscape page holds.
    const from = day(20);
    for (let offset = 0; offset < 3; offset += 1) {
      for (let slot = 0; slot < 20; slot += 1) {
        const minutes = 8 * 60 + slot * 30;
        const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        await insertAppointment(world, {
          date: addDays(from, offset),
          time,
          minutes: 30,
          status: "COMPLETED",
        });
      }
    }
    const period = { from, to: addDays(from, 2) };
    const render = async (ctx: BillingWorld["manager"]) => {
      const exported = await freshReports({ realPdf: true }).api.exportReport(
        ctx,
        "appointments",
        "pdf",
        custom(period),
      );
      if (!exported.ok) throw new Error(exported.error.code);
      return readPdf(Buffer.from(exported.value.body as Buffer));
    };

    // Without a logo the header paints no image, so the image found below is the logo.
    const withoutLogo = await render(world.manager);
    expect(withoutLogo.length).toBeGreaterThan(1);
    expect(withoutLogo.flatMap((page) => page.images)).toEqual([]);

    // The F01 logo, stored as the PNG the logo processor makes.
    const logoPng = await sharp({ create: { width: 240, height: 96, channels: 3, background: "#336699" } })
      .png()
      .toBuffer();
    const uploaded = await identity.uploadOrganizationLogo(world.admin, {
      bytes: new Uint8Array(logoPng),
      type: "image/png",
    });
    if (!uploaded.ok) throw new Error(`uploadOrganizationLogo failed: ${uploaded.error.code}`);
    const stored = await identity.getOrganizationLogo(world.manager);
    if (!stored.ok || !stored.value) throw new Error("logo missing");
    const logo = await sharp(Buffer.from(stored.value.body)).metadata();
    const profile = await getOrganizationProfile(world.manager);
    if (!profile.ok) throw new Error(profile.error.code);
    const clinicName = profile.value.tradeName ?? profile.value.legalName;

    const pages = await render(world.manager);
    const total = pages.length;
    expect(total).toBeGreaterThan(1);
    pages.forEach((page, index) => {
      // The header repeats on every page: the logo image next to the clinic name.
      expect(page.images).toEqual([expect.objectContaining({ width: logo.width, height: logo.height })]);
      const lines = page.text.split("\n");
      expect(lines).toContain(clinicName);
      expect(lines).toContain(`Página ${index + 1} de ${total}`);
    });
    expect(pages[0]?.text.split("\n")).toContain("Agendamentos");

    // The page label follows the language of the report.
    const english = await render({ ...world.manager, locale: "en" as const });
    english.forEach((page, index) => {
      expect(page.images).toHaveLength(1);
      expect(page.text.split("\n")).toContain(`Page ${index + 1} of ${english.length}`);
    });
  });

  it("F13: PDF money totals are listed per currency", async () => {
    const period = await controlledDataset(world);
    const { api, documents } = freshReports();
    const exported = await api.exportReport(world.manager, "appointments", "pdf", custom(period));
    if (!exported.ok) throw new Error(exported.error.code);
    const price = documents[0]?.totals.find((pair) => pair.label === "Preço");
    expect(price?.value).toMatch(/R\$ 2\.000,00/);
    expect(price?.value).toMatch(/€ 250,00/);
  });
});

describe("report language", () => {
  it("F13: report columns, CSV headers and values, and PDF texts follow the user's language", async () => {
    const period = await controlledDataset(world);
    const english = { ...world.manager, locale: "en" as const };
    const spanish = { ...world.manager, locale: "es" as const };
    const { api, documents } = freshReports();

    const view = await api.getReport(english, "appointments", custom(period, { status: "COMPLETED" }));
    if (!view.ok) throw new Error(view.error.code);
    expect(view.value.columns.map((column) => column.label)).toEqual([
      "Date",
      "Time",
      "Patient",
      "Service",
      "Professional",
      "Unit",
      "Room",
      "Status",
      "Price",
    ]);
    expect(JSON.stringify(view.value.rows[0])).toContain("Completed");
    expect(view.value.totalsRow.date?.[0]).toBe("Total: 4 rows");

    const pdf = await api.exportReport(english, "appointments", "pdf", custom(period));
    if (!pdf.ok) throw new Error(pdf.error.code);
    expect(documents[0]?.title).toBe("Appointments");
    expect(documents[0]?.pageLabel).toBe("Page {page} of {total}");
    expect(documents[0]?.subtitle).toContain("Period:");

    const es = await api.exportReport(spanish, "cancellations", "pdf", custom(period));
    if (!es.ok) throw new Error(es.error.code);
    expect(documents[1]?.title).toBe("Cancelaciones y ausencias");
    expect(documents[1]?.pageLabel).toBe("Página {page} de {total}");
  });
});
