import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { signIn, sql } from "./support";

// F12 critical journeys. They run after the F11 journeys (alphabetical order, one worker): the
// clinic has "Unidade Centro" (BRL), professionals, the front desk user and payments received today.
const ADMIN_PASSWORD = "senhaAdmin2026";
const DESK = { email: "carlos.recepcao@e2e.gcli", password: "senhaNova2026" };

// The dashboard caches its figures for 5 minutes per filter combination (ADR-037), and every
// Administrator sign-in lands on "Mês atual" with all units (PRD F01). The first sign-in of the run
// happens while the database is still empty, so on a fast machine that cached empty result would
// still be served here. Each journey therefore opens a period that no other journey loads.
const JOURNEY_PERIOD = { manager: "LAST_30_DAYS", professional: "LAST_7_DAYS" } as const;

async function signedIn(browser: Browser, user: { email: string; password: string }) {
  const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await context.newPage();
  await signIn(page, user.email, user.password);
  await expect(page).toHaveURL(/\/(schedule|dashboard|patients|financial)/);
  return page;
}

// The app header has its own "Unidade" selector, so the trigger is looked up inside the filter bar.
async function pickOption(page: Page, label: string, option: string) {
  await page.getByRole("group", { name: "Filtros do painel" }).getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const card = (page: Page, label: string) => page.getByRole("region", { name: label, exact: true });

test('F12: manager opens the dashboard, changes the period and the unit, and sees the KPIs, the variation and "Atualizado às"', async ({
  browser,
}) => {
  const [unit] = await sql<{ id: string; name: string }>(
    `SELECT id, name FROM unit WHERE active ORDER BY name LIMIT 1`,
  );
  if (!unit) throw new Error("no active unit");
  const page = await signedIn(browser, { email: ADMIN.email, password: ADMIN_PASSWORD });
  await page.goto(`/dashboard?period=${JOURNEY_PERIOD.manager}`);
  await expect(page.getByRole("heading", { name: "Painel", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operação" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Financeiro" })).toBeVisible();
  await expect(page.getByTestId("dashboard-freshness")).toHaveText(/^Atualizado às \d{2}:\d{2}$/);

  // Payments of the F09 and F11 journeys were received today, in this month.
  await expect(card(page, "Recebido")).toContainText("R$");
  await expect(card(page, "Agendamentos")).toContainText(
    /vs\. período anterior|Sem base de comparação|Sem variação/,
  );
  await expect(card(page, "Resultado")).toBeVisible();

  await pickOption(page, "Unidade", unit.name);
  await expect(page).toHaveURL(new RegExp(`unit=${unit.id}`));
  await expect(page.getByTestId("dashboard-freshness")).toHaveText(/^Atualizado às/);

  // A future period without data shows the empty state.
  await pickOption(page, "Período", "Personalizado");
  await page.getByLabel("De", { exact: true }).fill("2099-01-01");
  await page.getByLabel("Até", { exact: true }).fill("2099-01-07");
  await expect(page.getByText("Sem dados para o período selecionado.")).toBeVisible();
  await expect(page).toHaveURL(/period=CUSTOM/);

  // The URL keeps the filters on reload.
  await page.reload();
  await expect(page.getByText("Sem dados para o período selecionado.")).toBeVisible();
  await page.context().close();
});

test('F12: selecting a professional hides "Despesas pagas" and "Resultado"', async ({ browser }) => {
  // The lists show the display name, or the full name when there is none.
  const [professional] = await sql<{ display_name: string }>(
    `SELECT coalesce(display_name, full_name) AS display_name FROM professional WHERE active ORDER BY 1 LIMIT 1`,
  );
  if (!professional) throw new Error("no professional");
  const page = await signedIn(browser, { email: ADMIN.email, password: ADMIN_PASSWORD });
  await page.goto(`/dashboard?period=${JOURNEY_PERIOD.professional}`);
  await expect(card(page, "Despesas pagas")).toBeVisible();
  await pickOption(page, "Profissional", professional.display_name);
  await expect(page.getByTestId("professional-note")).toHaveText(
    "Despesas e resultado não se aplicam a um profissional.",
  );
  await expect(card(page, "Despesas pagas")).toHaveCount(0);
  await expect(card(page, "Resultado")).toHaveCount(0);
  await expect(card(page, "Faturado")).toBeVisible();
  await page.context().close();
});

test("F12: front desk cannot open the dashboard", async ({ browser }) => {
  const page = await signedIn(browser, DESK);
  const response = await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Você não tem permissão para acessar esta página" }),
  ).toBeVisible();
  expect(response?.status()).toBe(403);
  await page.context().close();
});
