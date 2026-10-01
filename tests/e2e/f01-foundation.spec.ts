import { expect, test } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { linkFromEmail, setPassword, signIn, sql } from "./support";

// Critical journeys of F01 (spec section 7, "E2E journeys"). Tests run in order and share the
// E2E database prepared by global-setup.ts.
test.describe.configure({ mode: "serial" });

const ADMIN_PASSWORD = "senhaAdmin2026";
const DESK = { name: "Carlos Recepção", email: "carlos.recepcao@e2e.gcli", password: "senhaRecepcao2026" };

test("F01: administrator accepts the setup invitation and invites a front desk user who signs in", async ({
  page,
  browser,
}) => {
  await page.goto(await linkFromEmail(ADMIN.email, "/invite?token="));
  await expect(page.getByRole("heading", { name: "Bem-vindo ao GCli" })).toBeVisible();
  await setPassword(page, ADMIN_PASSWORD, "Definir senha e entrar");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("link", { name: "Usuários" }).click();
  const invitedAt = new Date();
  await page.getByRole("button", { name: "Convidar usuário" }).click();
  await page.getByLabel("Nome completo").fill(DESK.name);
  await page.getByLabel("E-mail").fill(DESK.email);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByRole("cell", { name: DESK.email })).toBeVisible();
  await expect(page.getByText("Convite pendente")).toBeVisible();

  const desk = await (await browser.newContext()).newPage();
  await desk.goto(await linkFromEmail(DESK.email, "/invite?token=", invitedAt));
  await setPassword(desk, DESK.password, "Definir senha e entrar");
  await expect(desk).toHaveURL(/\/schedule$/);
  await expect(desk.getByRole("heading", { name: "Agenda" })).toBeVisible();
});

test("F01: front desk cannot open user settings", async ({ page }) => {
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole("link", { name: "Usuários" })).toHaveCount(0);
  await page.goto("/settings/users");
  await expect(
    page.getByRole("heading", { name: "Você não tem permissão para acessar esta página" }),
  ).toBeVisible();
});

test("F01: locked account shows lock message", async ({ page }) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    await signIn(page, DESK.email, "senhaErrada123");
    await expect(page.getByText("E-mail ou senha inválidos.").last()).toBeVisible();
  }
  await signIn(page, DESK.email, DESK.password);
  await expect(page.getByText("Conta bloqueada temporariamente")).toBeVisible();
});

test("F01: forgotten password flow", async ({ page }) => {
  const requestedAt = new Date();
  await page.goto("/login");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  // The login page also has an "E-mail" field: wait for the new page before filling it.
  await expect(page.getByRole("heading", { name: "Esqueci minha senha" })).toBeVisible();
  await page.getByLabel("E-mail").fill(DESK.email);
  await page.getByRole("button", { name: "Enviar link de redefinição" }).click();
  await expect(page.getByText("Se o e-mail estiver cadastrado")).toBeVisible();

  await page.goto(await linkFromEmail(DESK.email, "/reset-password?token=", requestedAt));
  await setPassword(page, "senhaNova2026", "Redefinir senha");
  await expect(page.getByText("Senha redefinida.")).toBeVisible();
  // A successful reset also clears the lock from the previous test.
  await signIn(page, DESK.email, "senhaNova2026");
  await expect(page).toHaveURL(/\/schedule$/);
});

test("F01: expired session restores the form draft", async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/settings/organization");
  await page.getByLabel("Razão social").fill("Clínica E2E Serviços de Saúde Ltda");

  // Simulates 60 idle minutes: the session is no longer valid when the form is submitted.
  await sql("UPDATE session SET last_active_at = now() - interval '2 hours'");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Forganization&reason=expired/);
  await expect(page.getByText("Sua sessão expirou.")).toBeVisible();

  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/settings\/organization$/);
  await expect(page.getByLabel("Razão social")).toHaveValue("Clínica E2E Serviços de Saúde Ltda");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Configurações salvas")).toBeVisible();
});
