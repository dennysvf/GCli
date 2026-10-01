import { expect, test, type Page } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { linkFromEmail, setPassword, signIn, sql } from "./support";

// F04 critical journeys. Run after f02-units.spec.ts (alphabetical order, one worker), which
// creates "Unidade Centro" open Monday to Friday from 08:00 to 18:00. F03 deactivates its only
// service, so an active service is inserted directly to fill the Serviços tab.
const ADMIN_PASSWORD = "senhaAdmin2026";
const PROFESSIONAL = { name: "Paula Prado", email: "paula.prado@e2e.gcli", password: "senhaPaula2026" };

function dateFromToday(days: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + days * 86_400_000));
}

async function openProfessionals(page: Page) {
  await page.locator("[data-sidebar=menu-button]", { hasText: "Profissionais" }).click();
  await expect(page.getByRole("heading", { name: "Profissionais", level: 1 })).toBeVisible();
}

async function addVacation(page: Page, from: string, to: string) {
  await page.getByRole("button", { name: "Nova ausência" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Início").fill(from);
  await dialog.getByLabel("Último dia").fill(to);
  await dialog.getByRole("button", { name: "Registrar ausência" }).click();
  await expect(page.getByText("Ausência registrada.")).toBeVisible();
}

test("F04: administrator registers a professional and sets services and working hours", async ({ page }) => {
  await sql(
    `INSERT INTO service (id, organization_id, category_id, name, duration_minutes, price_cents, color, requires_room, updated_at)
     SELECT gen_random_uuid(), c.organization_id, c.id, 'Consulta dermatológica', 30, 25000, 'blue', false, now()
     FROM service_category c WHERE c.name = 'Consultas'`,
  );
  await signIn(page, ADMIN.email, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await openProfessionals(page);
  await page.getByRole("link", { name: "Novo profissional" }).click();

  await page.getByLabel("Nome completo").fill("Ana Paula Lima");
  await page.getByLabel("Especialidade (opcional)").fill("Dermatologia");
  await page.getByRole("button", { name: "Cadastrar profissional" }).click();
  // PRD F04: council number and state are required when the council is not "Nenhum".
  await expect(page.getByText("Informe o número do conselho.")).toBeVisible();
  await page.getByLabel("Número").fill("123456");
  await page.getByRole("combobox", { name: "UF" }).click();
  await page.getByRole("option", { name: "SP", exact: true }).click();
  await page.getByRole("button", { name: "Cadastrar profissional" }).click();
  await expect(page).toHaveURL(/\/settings\/professionals\/[0-9a-f-]{36}\?tab=services$/);
  await expect(page.getByText("Dermatologia · CRM 123456/SP")).toBeVisible();

  await page.getByRole("button", { name: "Selecionar todos da categoria" }).click();
  await expect(page.getByRole("checkbox", { name: /Consulta dermatológica/ })).toBeChecked();
  await page.getByRole("button", { name: "Salvar serviços" }).click();
  await expect(page.getByText("Serviços atualizados.")).toBeVisible();

  await page.getByRole("tab", { name: "Horários" }).click();
  const monday = page.getByTestId("weekday-1");
  await expect(monday).toContainText("Funcionamento: 08:00–18:00");
  await monday.getByRole("button", { name: "Adicionar intervalo" }).click();
  await monday.getByLabel("Segunda, intervalo 1, início").fill("07:00");
  // PRD F04: the grid highlights intervals outside the unit's business hours before saving.
  await expect(monday.getByRole("alert")).toHaveText(
    "O horário informado está fora do funcionamento da unidade (08:00–18:00).",
  );
  await monday.getByLabel("Segunda, intervalo 1, início").fill("08:00");
  await expect(monday.getByRole("alert")).toHaveCount(0);
  await monday.getByRole("button", { name: "Copiar para os dias úteis" }).click();
  await expect(page.getByRole("tab", { name: "Unidade Centro (5)" })).toBeVisible();
  await page.getByRole("button", { name: "Salvar horário" }).click();
  await expect(page.getByText("Horário salvo.")).toBeVisible();

  await page.getByRole("tab", { name: "Ausências" }).click();
  await addVacation(page, dateFromToday(10), dateFromToday(14));
  await expect(page.getByRole("cell", { name: "Férias" })).toBeVisible();

  await openProfessionals(page);
  const row = page.locator("tr", { hasText: "Ana Paula Lima" });
  await expect(row).toContainText("Unidade Centro");
  await expect(row).toContainText("Ativo");
});

test("F04: professional manages only their own time-offs", async ({ page, browser }) => {
  await signIn(page, ADMIN.email, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);

  // Invite a Professional-role user and link them to a new profile.
  await page.getByRole("link", { name: "Usuários" }).click();
  const invitedAt = new Date();
  await page.getByRole("button", { name: "Convidar usuário" }).click();
  await page.getByLabel("Nome completo").fill(PROFESSIONAL.name);
  await page.getByLabel("E-mail").fill(PROFESSIONAL.email);
  await page.getByRole("combobox", { name: "Perfil" }).click();
  await page.getByRole("option", { name: "Profissional" }).click();
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByRole("cell", { name: PROFESSIONAL.email })).toBeVisible();

  const professional = await (await browser.newContext()).newPage();
  await professional.goto(await linkFromEmail(PROFESSIONAL.email, "/invite?token=", invitedAt));
  await setPassword(professional, PROFESSIONAL.password, "Definir senha e entrar");
  await expect(professional).toHaveURL(/\/schedule$/);

  await openProfessionals(page);
  await page.getByRole("link", { name: "Novo profissional" }).click();
  await page.getByLabel("Nome completo").fill(PROFESSIONAL.name);
  await page.getByRole("combobox", { name: "Conselho" }).click();
  await page.getByRole("option", { name: "CREFITO" }).click();
  await page.getByLabel("Número").fill("98765-F");
  await page.getByRole("combobox", { name: "UF" }).click();
  await page.getByRole("option", { name: "SP", exact: true }).click();
  await page.getByRole("combobox", { name: "Usuário vinculado (opcional)" }).click();
  await page.getByRole("option", { name: `${PROFESSIONAL.name} (Profissional)` }).click();
  await page.getByRole("button", { name: "Cadastrar profissional" }).click();
  await expect(page).toHaveURL(/\?tab=services$/);
  const ownId = page.url().match(/professionals\/([0-9a-f-]{36})/)?.[1];
  const [other] = await sql<{ id: string }>(`SELECT id FROM professional WHERE full_name = 'Ana Paula Lima'`);

  // The linked professional lands on their own profile, read-only, and manages their time-offs.
  await professional.locator("[data-sidebar=menu-button]", { hasText: "Profissionais" }).click();
  await expect(professional).toHaveURL(new RegExp(`/settings/professionals/${ownId}$`));
  await expect(professional.getByLabel("Nome completo")).toHaveAttribute("readonly", "");
  await expect(professional.getByRole("button", { name: "Salvar alterações" })).toHaveCount(0);
  await professional.getByRole("tab", { name: "Ausências" }).click();
  await addVacation(professional, dateFromToday(20), dateFromToday(21));
  await professional.getByRole("button", { name: /Excluir ausência de/ }).click();
  await professional.getByRole("alertdialog").getByRole("button", { name: "Excluir ausência" }).click();
  await expect(professional.getByText("Ausência excluída.")).toBeVisible();
  await expect(professional.getByText("Nenhuma ausência programada.")).toBeVisible();

  // Another professional's profile is forbidden.
  await professional.goto(`/settings/professionals/${other?.id}`);
  await expect(
    professional.getByRole("heading", { name: "Você não tem permissão para acessar esta página" }),
  ).toBeVisible();
});
