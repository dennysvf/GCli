import { expect, test } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { signIn } from "./support";

// F03 critical journey. Runs after f01-foundation.spec.ts (alphabetical order, one worker), which
// sets the administrator password. The default categories come from the OrganizationCreated
// subscriber that runs when global-setup creates the organization.
const ADMIN_PASSWORD = "senhaAdmin2026";
const PRICE_CONFIRMATION =
  "O novo preço valerá para novos agendamentos. Agendamentos existentes mantêm o preço original.";

test("F03: administrator creates a service, changes its price and deactivates it", async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.locator("[data-sidebar=menu-button]", { hasText: "Serviços" }).click();
  await expect(page.getByRole("heading", { name: "Procedimentos" })).toBeVisible();
  await page.getByRole("link", { name: "Novo serviço" }).click();

  const panel = page.getByRole("dialog");
  await panel.getByLabel("Nome").fill("Limpeza de pele");
  await panel.getByRole("combobox", { name: "Categoria" }).click();
  await page.getByRole("option", { name: "Procedimentos" }).click();
  await panel.getByRole("combobox", { name: "Duração" }).click();
  await page.getByRole("option", { name: "1h 30min" }).click();
  await panel.getByRole("textbox", { name: "Preço" }).fill("18000");
  await expect(panel.getByRole("textbox", { name: "Preço" })).toHaveValue("R$ 180,00");
  await panel.getByRole("radio", { name: "Verde-esmeralda" }).click();
  await panel.getByRole("button", { name: "Criar serviço" }).click();
  await expect(page.getByText("Serviço salvo")).toBeVisible();
  await expect(page).toHaveURL(/service=[0-9a-f-]{36}/);

  // The modal panel hides the page from the accessibility tree, so rows are located by CSS.
  const row = page.locator("tr", { hasText: "Limpeza de pele" });
  await expect(row).toContainText("1h 30min");
  await expect(row).toContainText("R$ 180,00");

  await panel.getByRole("textbox", { name: "Preço" }).fill("20000");
  await panel.getByRole("button", { name: "Salvar", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(PRICE_CONFIRMATION);
  await confirm.getByRole("button", { name: "Salvar novo preço" }).click();
  await expect(row).toContainText("R$ 200,00");

  await panel.getByRole("tab", { name: "Histórico de preços" }).click();
  const history = panel.getByRole("list", { name: "Histórico de preços" }).getByRole("listitem");
  await expect(history).toHaveCount(2);
  await expect(history.first()).toContainText("R$ 200,00");
  await expect(history.first()).toContainText(ADMIN.name);

  await panel.getByRole("tab", { name: "Dados" }).click();
  await panel.getByRole("button", { name: "Desativar serviço" }).click();
  await expect(page.getByText("Serviço desativado")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("tr", { hasText: "Limpeza de pele" })).toHaveCount(0);
});
