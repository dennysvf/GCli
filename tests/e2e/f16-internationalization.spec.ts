import { expect, test, type Page } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { signIn, sql } from "./support";

// F16 critical journeys. Run after f06-scheduling.spec.ts (alphabetical order, one worker): the
// organization has "Unidade Centro", the professional "Ana Paula Lima" with "Consulta
// dermatológica" (enabled, R$ 250,00) and the patient "Maria Silva Oliveira".
const ADMIN_PASSWORD = "senhaAdmin2026";
const DESK = { email: "carlos.recepcao@e2e.gcli", password: "senhaNova2026" };
const PROFESSIONAL = "Ana Paula Lima";

async function chooseLanguage(page: Page, menuLabel: string, language: string) {
  await page.getByRole("button", { name: menuLabel }).click();
  await page.getByRole("menuitemradio", { name: language }).click();
}

function localDate(offset: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}

// The next weekday at least `from` days ahead (the unit and the professional work Monday to Friday).
function nextWeekday(from: number): string {
  for (let offset = from; ; offset++) {
    const date = localDate(offset);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return date;
  }
}

test("F16: each user switches the language and the interface follows it", async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  const menu = (label: string) => page.locator("[data-sidebar=menu-button]", { hasText: label });
  await expect(menu("Unidades")).toBeVisible();

  await chooseLanguage(page, "Menu do usuário", "English");
  await expect(menu("Units")).toBeVisible();
  await expect(menu("Patients")).toBeVisible();
  await menu("Services").click();
  await expect(page.getByRole("heading", { name: "Procedimentos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New service" })).toBeVisible();

  // The choice is stored on the user, so it survives a reload and a new page.
  await page.reload();
  await expect(page.getByRole("link", { name: "New service" })).toBeVisible();

  await chooseLanguage(page, "User menu", "Español");
  await expect(menu("Sedes")).toBeVisible();
  await expect(page.getByRole("link", { name: "Nuevo servicio" })).toBeVisible();
  await expect(page.locator("tr", { hasText: "Consulta dermatológica" })).toContainText("250,00");

  await chooseLanguage(page, "Menú del usuario", "Português (Brasil)");
  await expect(menu("Unidades")).toBeVisible();
  await expect(page.getByRole("link", { name: "Novo serviço" })).toBeVisible();
});

test("F16: a unit in Portugal sells in euros and the booking snapshots the currency", async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);

  // The country defines the currency, the time zone and the address fields of the unit.
  await page.goto("/settings/units/new");
  await page.getByLabel("Nome", { exact: true }).fill("Unidade Lisboa");
  await page.getByRole("combobox", { name: "País", exact: true }).click();
  await page.getByRole("option", { name: "Portugal", exact: true }).click();
  await expect(page.getByLabel("Moeda")).toHaveValue("EUR");
  await expect(page.getByRole("combobox", { name: "Fuso horário" })).toContainText("Lisbon");
  await expect(page.getByText(/regras legais deste país ainda não foram validadas/)).toBeVisible();
  await page.getByLabel("Código postal").fill("1100053");
  await expect(page.getByLabel("Código postal")).toHaveValue("1100-053");
  await page.getByLabel("Logradouro").fill("Rua Augusta");
  await page.getByLabel("Cidade").fill("Lisboa");
  await page.getByRole("button", { name: "Criar unidade" }).click();
  await expect(page).toHaveURL(/\/settings\/units\/[0-9a-f-]{36}\?tab=horario$/);
  // Services without a price in the new currency are listed so the administrator can price them.
  await expect(page.getByText(/preço em EUR/).first()).toBeVisible();
  const [lisbon] = await sql<{ id: string }>(`SELECT id FROM unit WHERE name = 'Unidade Lisboa'`);
  if (!lisbon) throw new Error("unit not created");
  expect(
    await sql(`SELECT 1 FROM unit WHERE id = $1 AND country = 'PT' AND currency = 'EUR'`, [lisbon.id]),
  ).toHaveLength(1);

  await page.locator("#open-1").click();
  await page.getByRole("button", { name: "Copiar segunda para todos os dias úteis" }).click();
  await page.getByRole("button", { name: "Salvar horário" }).click();
  await expect(page.getByText("Horário de funcionamento salvo")).toBeVisible();

  // The service gets its price in euros next to the one in reais.
  const [service] = await sql<{ id: string }>(`SELECT id FROM service WHERE name = 'Consulta dermatológica'`);
  if (!service) throw new Error("service not found");
  await page.goto(`/settings/services?service=${service.id}`);
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("textbox", { name: "Preço (BRL)" })).toHaveValue("R$ 250,00");
  await panel.getByRole("textbox", { name: "Preço (EUR)" }).fill("6000");
  await expect(panel.getByRole("textbox", { name: "Preço (EUR)" })).toHaveValue(/60,00/);
  await panel.getByRole("button", { name: "Salvar", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  if (await confirm.isVisible()) await confirm.getByRole("button", { name: "Salvar novo preço" }).click();
  await expect(page.getByText("Serviço salvo")).toBeVisible();

  // Registrations and schedules of the professional are prepared in the database: the journeys
  // above cover the forms, and this one is about the booking in euros.
  await sql(
    `INSERT INTO professional_registration (id, organization_id, professional_id, country, council_type, number)
     SELECT gen_random_uuid(), organization_id, id, 'PT', 'ORDEM_MEDICOS', '12345'
     FROM professional WHERE full_name = $1`,
    [PROFESSIONAL],
  );
  await sql(
    `INSERT INTO professional_working_interval (id, organization_id, schedule_id, unit_id, weekday, start_minute, end_minute)
     SELECT gen_random_uuid(), s.organization_id, s.id, $2, d, 480, 720
     FROM professional_schedule s
     JOIN professional p ON p.id = s.professional_id AND p.full_name = $1
     CROSS JOIN generate_series(1, 5) AS d
     WHERE s.valid_until IS NULL`,
    [PROFESSIONAL, lisbon.id],
  );

  await page.context().clearCookies();
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule$/);
  const day = nextWeekday(2);
  await page.goto(`/schedule?unit=${lisbon.id}&view=day&date=${day}`);
  await page.getByRole("button", { name: `Agendar às 10:00, ${PROFESSIONAL}` }).click();
  const booking = page.getByRole("dialog");
  await booking.getByRole("combobox", { name: "Paciente" }).fill("Maria");
  await booking.getByRole("option", { name: /Maria Silva Oliveira/ }).click();
  await booking.getByRole("combobox", { name: "Serviço" }).click();
  await page.getByRole("option", { name: /Consulta dermatológica/ }).click();
  // The price comes in the currency of the unit, written the Portuguese way.
  await expect(booking.getByText(/10:00–10:30 · 60,00\s?€/)).toBeVisible();
  await booking.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(page.getByText("Agendamento criado")).toBeVisible();

  const booked = await sql<{ price_minor: string; currency: string }>(
    `SELECT a.price_minor::text, a.currency FROM appointment a WHERE a.unit_id = $1`,
    [lisbon.id],
  );
  expect(booked).toEqual([{ price_minor: "6000", currency: "EUR" }]);
});
