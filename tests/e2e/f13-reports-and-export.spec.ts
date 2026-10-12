import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { signIn, sql } from "./support";

// F13 critical journeys. They run after the F12 journeys (alphabetical order, one worker): the clinic
// has appointments, charges and payments from the earlier journeys.
const ADMIN_PASSWORD = "senhaAdmin2026";
const DESK = { email: "carlos.recepcao@e2e.gcli", password: "senhaNova2026" };
const BOM = String.fromCharCode(0xfeff);
const LOAD_MARK = "f13-load";

async function signedIn(browser: Browser, user: { email: string; password: string }) {
  const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await context.newPage();
  await signIn(page, user.email, user.password);
  await expect(page).toHaveURL(/\/(schedule|dashboard|patients|financial)/);
  return page;
}

function isoDay(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

// Wide enough to hold every appointment the earlier journeys created, within the 366-day limit.
async function openWideAppointments(page: Page) {
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Relatórios", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Agendamentos" }).click();
  await expect(page.getByRole("heading", { name: "Agendamentos", level: 1 })).toBeVisible();
  const filters = page.getByRole("group", { name: "Filtros do relatório" });
  await filters.getByLabel("Período", { exact: true }).click();
  await page.getByRole("option", { name: "Personalizado", exact: true }).click();
  await page.getByLabel("De", { exact: true }).fill(isoDay(-180));
  await page.getByLabel("Até", { exact: true }).fill(isoDay(180));
  await page.getByRole("button", { name: "Gerar" }).click();
}

test("F13: manager opens Relatórios, generates a report, pages through it and exports CSV and PDF", async ({
  browser,
}) => {
  const page = await signedIn(browser, { email: ADMIN.email, password: ADMIN_PASSWORD });
  await openWideAppointments(page);

  await expect(page.getByRole("table").first()).toBeVisible();
  await expect(page.getByText(/^Total: \d+ linhas$/)).toBeVisible();
  await expect(page).toHaveURL(/run=1/);

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toMatch(/^agendamentos-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/);
  const csvText = await readFile((await csv.path()) ?? "", "utf8");
  expect(csvText.startsWith(BOM)).toBe(true);
  expect(csvText.split("\r\n")[0]).toContain("Data;Horário;Paciente");
  await expect(page.getByText("Arquivo gerado.")).toBeVisible();

  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar PDF" }).click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  const pdfBytes = await readFile((await pdf.path()) ?? "");
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");

  // Another report from the index.
  await page.goto("/reports");
  await page.getByRole("link", { name: "Contas a receber" }).click();
  await expect(page.getByRole("heading", { name: "Contas a receber", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Gerar" }).click();
  await expect(page).toHaveURL(/run=1/);
  await page.context().close();
});

test("F13: filters are remembered for the report during the session", async ({ browser }) => {
  const page = await signedIn(browser, { email: ADMIN.email, password: ADMIN_PASSWORD });
  await openWideAppointments(page);
  await expect(page).toHaveURL(/run=1/);

  // Back to the same report without URL parameters: the last filters are restored.
  await page.goto("/reports/appointments");
  await expect(page.getByLabel("De", { exact: true })).toHaveValue(isoDay(-180));
  await expect(page.getByLabel("Até", { exact: true })).toHaveValue(isoDay(180));
  await page.context().close();
});

test("F13: PDF export is disabled with the CSV advice above 5,000 rows", async ({ browser }) => {
  const [seed] = await sql<{
    unit_id: string;
    professional_id: string;
    service_id: string;
    patient_id: string;
  }>(
    `SELECT (SELECT id FROM unit WHERE active ORDER BY name LIMIT 1) AS unit_id,
            (SELECT id FROM professional WHERE active ORDER BY full_name LIMIT 1) AS professional_id,
            (SELECT id FROM service WHERE active ORDER BY name LIMIT 1) AS service_id,
            (SELECT id FROM patient ORDER BY created_at LIMIT 1) AS patient_id`,
  );
  if (!seed?.unit_id || !seed.professional_id || !seed.service_id || !seed.patient_id) {
    throw new Error("the earlier journeys left no unit, professional, service or patient");
  }
  const [organization] = await sql<{ id: string }>(`SELECT id FROM organization LIMIT 1`);
  if (!organization) throw new Error("no organization");
  // 5,001 appointments in 2090, outside every other journey; removed in the finally block.
  await sql(
    `INSERT INTO appointment (id, organization_id, unit_id, professional_id, service_id, patient_id, starts_at, ends_at,
                              duration_minutes, price_minor, currency, status, is_overbooking, notes)
     SELECT gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
            '2090-01-01T12:00:00Z'::timestamptz + (g * interval '10 minutes'),
            '2090-01-01T12:00:00Z'::timestamptz + (g * interval '10 minutes') + interval '5 minutes',
            5, 10000, (SELECT currency FROM unit WHERE id = $2::uuid), 'COMPLETED', true, $6
     FROM generate_series(1, 5001) AS g`,
    [organization.id, seed.unit_id, seed.professional_id, seed.service_id, seed.patient_id, LOAD_MARK],
  );
  try {
    const page = await signedIn(browser, { email: ADMIN.email, password: ADMIN_PASSWORD });
    await page.goto("/reports/appointments?period=CUSTOM&from=2090-01-01&to=2090-12-31&run=1");
    await expect(page.getByText(/^Total: 5\.001 linhas$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Exportar PDF" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Exportar CSV" })).toBeEnabled();
    await expect(page.getByText("O PDF aceita até 5.000 linhas. Exporte em CSV.")).toBeVisible();
    await page.context().close();
  } finally {
    await sql(`DELETE FROM appointment WHERE notes = $1`, [LOAD_MARK]);
  }
});

test("F13: front desk cannot open the reports", async ({ browser }) => {
  const page = await signedIn(browser, DESK);
  const response = await page.goto("/reports/appointments");
  await expect(
    page.getByRole("heading", { name: "Você não tem permissão para acessar esta página" }),
  ).toBeVisible();
  expect(response?.status()).toBe(403);
  await expect(page.getByRole("link", { name: "Relatórios" })).toHaveCount(0);
  await page.context().close();
});
