import { expect, test } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { signIn } from "./support";

// F02 critical journey. Runs after f01-foundation.spec.ts (alphabetical order, one worker), which
// accepts the administrator invitation and sets the password used here. The address is typed
// by hand so the test does not depend on the external CEP services.
const ADMIN_PASSWORD = "senhaAdmin2026";

test("F02: administrator creates a unit with hours, rooms and a closure", async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Nenhuma unidade")).toBeVisible();

  await page.getByRole("link", { name: "Unidades" }).click();
  await page.getByRole("link", { name: "Nova unidade" }).click();
  await page.getByLabel("Nome").fill("Unidade Centro");
  await page.getByLabel("Logradouro").fill("Avenida Paulista");
  await page.getByLabel("Número").fill("1000");
  await page.getByLabel("Cidade").fill("São Paulo");
  await page.getByRole("button", { name: "Criar unidade" }).click();
  await expect(page).toHaveURL(/\/settings\/units\/[0-9a-f-]+\?tab=horario$/);

  await page.locator("#open-1").click();
  await page.getByRole("button", { name: "Copiar segunda para todos os dias úteis" }).click();
  await page.getByRole("button", { name: "Salvar horário" }).click();
  await expect(page.getByText("Horário de funcionamento salvo")).toBeVisible();

  await page.getByRole("tab", { name: "Salas" }).click();
  await page.getByLabel("Nome da sala").fill("Sala 1");
  await page.getByRole("button", { name: "Adicionar sala" }).click();
  await expect(page.getByRole("cell", { name: "Sala 1", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Fechamentos" }).click();
  await page.getByLabel("Motivo").fill("Feriado municipal");
  await page.getByRole("button", { name: "Adicionar fechamento" }).click();
  await expect(page.getByRole("cell", { name: "Feriado municipal", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Unidades" }).click();
  await expect(page.getByRole("combobox", { name: "Unidade" })).toHaveText(/Unidade Centro/);
  await expect(page.getByText("1 sala ativa")).toBeVisible();
});
