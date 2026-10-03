import { expect, test, type Page } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { signIn } from "./support";

// F05 critical journeys. Run after f01-foundation.spec.ts (alphabetical order, one worker): the
// front desk user's password was reset there to "senhaNova2026". Addresses are typed by hand so
// the tests do not depend on the external CEP services.
const ADMIN_PASSWORD = "senhaAdmin2026";
const DESK = { email: "carlos.recepcao@e2e.gcli", password: "senhaNova2026" };

function yearsAgo(years: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number);
  return new Date(Date.UTC(year - years, month - 1, day)).toISOString().slice(0, 10);
}

async function openNewPatient(page: Page) {
  await page.locator("[data-sidebar=menu-button]", { hasText: "Pacientes" }).click();
  await page.getByRole("link", { name: "Novo paciente" }).click();
  await expect(page.getByRole("heading", { name: "Novo paciente" })).toBeVisible();
}

test("F05: front desk registers a patient, sees the duplicate warning and finds the patient from the header", async ({
  page,
}) => {
  // The administrator publishes the privacy terms (consent needs a published version).
  await signIn(page, ADMIN.email, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.locator("[data-sidebar=menu-button]", { hasText: "Termos de privacidade" }).click();
  await page
    .getByLabel("Texto dos termos")
    .fill("A clínica trata seus dados pessoais para agendar e registrar atendimentos, conforme a LGPD.");
  await page.getByRole("button", { name: "Publicar nova versão" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Publicar versão 1" }).click();
  await expect(page.getByText("Versão 1", { exact: true })).toBeVisible();
  await page.context().clearCookies();

  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule$/);
  await openNewPatient(page);
  await page.getByLabel("Nome completo").fill("Maria Silva Oliveira");
  await page.getByLabel("Data de nascimento").fill("1988-04-12");
  await page.getByLabel("Celular").fill("11988887777");
  await page.getByLabel("Documento (opcional)", { exact: true }).fill("52998224725");
  await expect(page.getByLabel("Documento (opcional)", { exact: true })).toHaveValue("529.982.247-25");
  await page.getByLabel("Logradouro").fill("Avenida Paulista");
  await page.getByLabel("Cidade").fill("São Paulo");
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/);
  const firstUrl = page.url();

  // PRD F05: "Cadastro incompleto" until the consent is recorded.
  await expect(page.getByText("Cadastro incompleto")).toBeVisible();
  await page.getByRole("button", { name: "Registrar consentimento" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar consentimento" }).click();
  await expect(page.getByText("Consentimento registrado.")).toBeVisible();
  await expect(page.getByText("Cadastro incompleto")).toHaveCount(0);
  await expect(page.getByText("Consentimento ok")).toBeVisible();

  // Same name and birth date: the duplicate dialog offers the existing record.
  await openNewPatient(page);
  await page.getByLabel("Nome completo").fill("maria silva oliveira");
  await page.getByLabel("Data de nascimento").fill("1988-04-12");
  await page.getByLabel("Celular").fill("11977776666");
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  const duplicate = page.getByRole("alertdialog");
  await expect(duplicate).toContainText("Encontramos um cadastro com o mesmo nome e data de nascimento.");
  await expect(duplicate).toContainText("***.***.247-25");
  await duplicate.getByRole("link", { name: "Abrir cadastro existente" }).click();
  await expect(page).toHaveURL(firstUrl);

  // Global search: "/" focuses the header field from any screen.
  await page.locator("body").click();
  await page.keyboard.press("/");
  await expect(page.getByRole("combobox", { name: "Buscar paciente" })).toBeFocused();
  await page.keyboard.type("oliveira");
  const results = page.getByRole("listbox", { name: "Resultados da busca de pacientes" });
  await expect(results.getByRole("option").first()).toContainText("Maria Silva Oliveira");
  await page.goto("/schedule");
  await page.keyboard.press("/");
  await page.keyboard.type("529.982");
  await expect(page.getByRole("listbox", { name: "Resultados da busca de pacientes" })).toBeVisible();
  await page.getByRole("combobox", { name: "Buscar paciente" }).fill("98888-7777");
  await expect(results.getByRole("option").first()).toContainText("Maria Silva Oliveira");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(firstUrl);
});

test("F05: a minor needs a guardian", async ({ page }) => {
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule$/);
  await openNewPatient(page);
  await page.getByLabel("Nome completo").fill("Lucas Prado Neto");
  await page.getByLabel("Data de nascimento").fill(yearsAgo(10));
  await page.getByLabel("Celular").fill("11966665555");
  await expect(page.getByTestId("guardian-section")).toBeVisible();
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(
    page.getByText("Pacientes menores de 18 anos precisam de um responsável cadastrado."),
  ).toBeVisible();

  await page.getByLabel("Nome do responsável").fill("Carla Prado");
  await page.getByLabel("Telefone do responsável").fill("11955554444");
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Nome do responsável")).toHaveValue("Carla Prado");
});
