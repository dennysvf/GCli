import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hash } from "@node-rs/argon2";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { signIn, sql } from "./support";

// F15 journeys (contract E2E-INVESTIGATE-01, E2E-LINK-01, E2E-LINK-02, plus UI-ACCESS-02). The
// fixtures (an Administrator "Ana Admin", a Front Desk user and the patient "Maria Souza" with her
// creation event) are added with SQL to the organization of global-setup, so the journeys do not
// depend on the data of earlier features.
const PASSWORD = "senhaF15Segura2026";
const USERS = {
  admin: { email: "f15.admin@e2e.gcli", name: "Ana Admin", role: "ADMINISTRATOR" },
  desk: { email: "f15.recepcao@e2e.gcli", name: "Carla Recepção", role: "FRONT_DESK" },
} as const;
const BOM = String.fromCharCode(0xfeff);

let patientId = "";

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const [org] = await sql<{ id: string }>(`SELECT id FROM organization ORDER BY created_at LIMIT 1`);
  if (!org) throw new Error("no E2E organization");
  const users: Record<string, string> = {};
  for (const [key, user] of Object.entries(USERS)) {
    const [existing] = await sql<{ id: string }>(`SELECT id FROM app_user WHERE email = $1`, [user.email]);
    if (existing) {
      users[key] = existing.id;
      continue;
    }
    const userId = randomUUID();
    await sql(
      `INSERT INTO app_user (id, organization_id, name, email, email_verified, role, status, locale)
       VALUES ($1, $2, $3, $4, true, $5, 'ACTIVE', 'pt-BR')`,
      [userId, org.id, user.name, user.email, user.role],
    );
    await sql(
      `INSERT INTO account (id, account_id, provider_id, user_id, password)
       VALUES ($1, $2, 'credential', $3, $4)`,
      [randomUUID(), userId, userId, await hash(PASSWORD)],
    );
    users[key] = userId;
  }
  const [patient] = await sql<{ id: string }>(
    `SELECT id FROM patient WHERE organization_id = $1 AND full_name = 'Maria Souza' LIMIT 1`,
    [org.id],
  );
  if (patient) {
    patientId = patient.id;
    // A rerun starts from the same phone number.
    await sql(
      `UPDATE patient SET mobile_phone = '+5511988881111', phone_digits = '11988881111' WHERE id = $1`,
      [patientId],
    );
    return;
  }
  patientId = randomUUID();
  await sql(
    `INSERT INTO patient (id, organization_id, full_name, normalized_name, birth_date, sex, mobile_phone,
       phone_digits, created_by_id, updated_by_id)
     VALUES ($1, $2, 'Maria Souza', 'maria souza', '1984-06-15', 'FEMALE', '+5511988881111', '11988881111', $3, $3)`,
    [patientId, org.id, users.desk],
  );
  await sql(
    `INSERT INTO audit_event (id, occurred_at, organization_id, actor_type, actor_user_id, action, entity_type,
       entity_id, summary, changes)
     VALUES ($1, now() - interval '1 day', $2, 'USER', $3, 'CREATE', 'patient', $4, 'Paciente cadastrado', $5)`,
    [
      randomUUID(),
      org.id,
      users.desk,
      patientId,
      JSON.stringify({ fullName: { before: null, after: "Maria Souza" } }),
    ],
  );
});

async function signedIn(browser: Browser, user: keyof typeof USERS): Promise<Page> {
  const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await context.newPage();
  await signIn(page, USERS[user].email, PASSWORD);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const rows = (page: Page) => page.locator("tbody tr[data-event-id]");

test("F15: administrator filters the audit log, opens an update diff and exports CSV", async ({
  browser,
}) => {
  const page = await signedIn(browser, "admin");

  // Edit the patient's mobile phone on the F05 page.
  await page.goto(`/patients/${patientId}`);
  await page.getByLabel("Celular").fill("11966663333");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeEnabled();
  await expect
    .poll(
      async () =>
        (
          await sql<{ mobile_phone: string }>(`SELECT mobile_phone FROM patient WHERE id = $1`, [patientId])
        )[0]?.mobile_phone,
    )
    .toBe("+5511966663333");

  // Configurações > Auditoria.
  await page.getByRole("link", { name: "Auditoria", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/audit/);
  await expect(page.getByRole("heading", { name: "Auditoria", level: 1 })).toBeVisible();
  await choose(page, "Ação", "Atualização");
  await expect(page).toHaveURL(/action=UPDATE/);
  await choose(page, "Tipo de entidade", "Paciente");
  await expect(page).toHaveURL(/entityType=patient/);

  const newest = rows(page).first();
  await expect(newest).toContainText("Ana Admin");
  await expect(newest).toContainText("Paciente");
  await newest.click();
  await expect(newest).toHaveAttribute("data-state", "selected");

  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("columnheader", { name: "Campo" })).toBeVisible();
  const phone = panel.getByRole("row").filter({ hasText: "Celular" });
  await expect(phone).toContainText("+5511988881111");
  await expect(phone).toContainText("+5511966663333");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(newest).toBeFocused();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^auditoria-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await readFile((await file.path()) ?? "", "utf8");
  expect(text.startsWith(BOM)).toBe(true);
  expect(text).toContain("+5511966663333");
  await expect(page.getByText("Arquivo gerado.")).toBeVisible();

  // The export is itself in the log.
  await choose(page, "Tipo de entidade", "Todos");
  await choose(page, "Ação", "Exportação");
  const exported = rows(page).first();
  await expect(exported).toContainText("Ana Admin");
  await expect(exported).toContainText("Log de auditoria");
});

test('F15: "Ver auditoria" on a patient page opens the viewer filtered by that patient', async ({
  browser,
}) => {
  const page = await signedIn(browser, "admin");
  await page.goto(`/patients/${patientId}`);
  await page.getByRole("link", { name: "Ver auditoria" }).click();
  await expect(page).toHaveURL(new RegExp(`/settings/audit\\?.*entityType=patient.*entityId=${patientId}`));
  await expect(page.getByRole("combobox", { name: "Tipo de entidade" })).toHaveText("Paciente");
  await expect(page.getByLabel("Id da entidade")).toHaveValue(patientId);
  await expect(rows(page).first()).toBeVisible();
  const count = await rows(page).count();
  for (let index = 0; index < count; index++) await expect(rows(page).nth(index)).toContainText("Paciente");
  await expect(rows(page).filter({ hasText: "Paciente cadastrado" })).toHaveCount(1);
});

test("F15: front desk does not see Auditoria and gets the 403 page at /settings/audit", async ({
  browser,
}) => {
  const page = await signedIn(browser, "desk");
  await expect(page.getByRole("link", { name: "Auditoria", exact: true })).toHaveCount(0);
  await page.goto(`/patients/${patientId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver auditoria" })).toHaveCount(0);
  const response = await page.goto("/settings/audit");
  expect(response?.status()).toBe(403);
  await expect(page.getByText("Você não tem permissão para acessar esta página")).toBeVisible();
  await expect(page.getByRole("link", { name: "Auditoria", exact: true })).toHaveCount(0);
});
