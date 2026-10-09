import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { signIn, sql } from "./support";

// F11 critical journeys. They run after f10-session-packages.spec.ts (alphabetical order, one
// worker): the clinic has "Unidade Centro" (BRL), the front desk user and the Administrator, who
// acts as the manager here. Payments of earlier journeys may already exist today, so the journeys
// read the expected cash from the screen instead of assuming it.
const ADMIN_PASSWORD = "senhaAdmin2026";
const DESK = { email: "carlos.recepcao@e2e.gcli", password: "senhaNova2026" };

type UnitRow = { id: string; name: string; time_zone: string };
let unit: UnitRow;
let today: string;
let patientId: string;

test.beforeAll(async () => {
  // The selected unit of a user without a stored choice is the first active one by name.
  const [row] = await sql<UnitRow>(`SELECT id, name, time_zone FROM unit WHERE active ORDER BY name LIMIT 1`);
  if (!row) throw new Error("no active unit");
  unit = row;
  const [date] = await sql<{ day: string }>(`SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM-DD') AS day`, [
    unit.time_zone,
  ]);
  today = date?.day ?? "";
  const [patient] = await sql<{ id: string }>(
    `SELECT id FROM patient WHERE full_name = 'Maria Silva Oliveira'`,
  );
  if (!patient) throw new Error("Maria Silva Oliveira is missing");
  patientId = patient.id;
});

async function signedIn(browser: Browser, user: { email: string; password: string }) {
  const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await context.newPage();
  await signIn(page, user.email, user.password);
  await expect(page).toHaveURL(/\/(schedule|dashboard|patients|financial)/);
  return page;
}

// A manual charge of the patient in the unit, so the journey owns its payment.
async function insertCharge(grossMinor: number): Promise<string> {
  const number = `2026-${800_000 + Math.floor(Math.random() * 99_000)}`;
  const [row] = await sql<{ id: string }>(
    `INSERT INTO charge (id, organization_id, number, patient_id, origin, description, unit_id, currency,
                         gross_minor, net_minor, status, created_by_id, version)
     SELECT gen_random_uuid(), p.organization_id, $1, p.id, 'MANUAL', 'Taxa E2E caixa', $2, 'BRL', $3, $3,
            'OPEN', (SELECT id FROM app_user WHERE email = $4), 1
       FROM patient p WHERE p.id = $5
     RETURNING id`,
    [number, unit.id, grossMinor, DESK.email, patientId],
  );
  if (!row) throw new Error("charge not inserted");
  return row.id;
}

// MoneyInput fills digits from the right: typing "20000" shows 200,00.
async function typeMoney(page: Page, label: string, minor: number) {
  const field = page.getByLabel(label, { exact: true });
  await field.click();
  await field.press("Control+A");
  await field.pressSequentially(String(minor));
}

// The options of a select open in a portal, so they are found on the page; the trigger is looked up
// inside `scope` when the page has another field with the same label (a filter and a form).
async function pickOption(page: Page, label: string, option: string, scope: Page | Locator = page) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

// "R$ 1.234,56" -> 123456
const minorOf = (text: string) => Number(text.replace(/\D/g, ""));

async function receiveInFull(page: Page, chargeId: string, method: string, amountMinor: number) {
  await page.goto(`/financial/charges/${chargeId}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Receber" }).click();
  const dialog = page.getByRole("dialog", { name: "Receber pagamento" });
  await pickOption(page, "Forma de pagamento", method);
  await typeMoney(page, "Valor", amountMinor);
  await dialog.getByRole("button", { name: "Confirmar recebimento" }).click();
}

const registerRows = () =>
  sql<{ id: string; status: string }>(
    `SELECT id, status FROM cash_register WHERE unit_id = $1 AND business_date = $2::date`,
    [unit.id, today],
  );

test("F11: front desk opens the register, receives cash, records a withdrawal and closes with a justified difference", async ({
  page,
}) => {
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule/);
  await page.goto("/financial/cash");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Caixa", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Abrir caixa" }).click();
  await expect.poll(async () => (await registerRows())[0]?.status, { timeout: 15_000 }).toBe("OPEN");

  // A cash payment of R$ 100,00 through the F09 flow shows up in the register by itself.
  const chargeId = await insertCharge(10_000);
  await receiveInFull(page, chargeId, "Dinheiro", 10_000);
  await expect
    .poll(
      async () =>
        (
          await sql<{ n: string }>(`SELECT count(*)::text AS n FROM payment WHERE charge_id = $1`, [chargeId])
        )[0]?.n,
      { timeout: 15_000 },
    )
    .toBe("1");
  await page.goto("/financial/cash");
  await page.waitForLoadState("networkidle");
  const summary = page.getByRole("region", { name: "Resumo por forma de pagamento" });
  await expect(summary.getByRole("cell", { name: "Dinheiro" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Cobrança 2026-/ }).first()).toBeVisible();

  // A manual withdrawal of R$ 45,90 for supplies.
  await page.getByRole("button", { name: "Nova movimentação" }).click();
  const movement = page.getByRole("dialog", { name: "Nova movimentação" });
  await typeMoney(page, "Valor", 4_590);
  await movement.getByLabel("Descrição", { exact: true }).fill("Compra de material de limpeza");
  await pickOption(page, "Categoria", "Materiais", movement);
  await movement.getByRole("button", { name: "Registrar movimentação" }).click();
  await expect
    .poll(
      async () =>
        (await sql(`SELECT 1 FROM cash_movement WHERE description = 'Compra de material de limpeza'`)).length,
      {
        timeout: 15_000,
      },
    )
    .toBe(1);

  // The table refreshes after the dialog closes; the expected cash in the closing dialog follows it.
  await expect(page.getByText("Compra de material de limpeza")).toBeVisible();

  // Closing: the counted cash is R$ 15,00 below the expected one, so a justification is required.
  await page.getByRole("button", { name: "Fechar caixa" }).click();
  const closing = page.getByRole("dialog", { name: "Fechar caixa" });
  const expected = minorOf(await closing.locator("dd").first().innerText());
  await typeMoney(page, "Dinheiro contado", expected - 1_500);
  await expect(closing.getByText(/Falta de R\$\s15,00/)).toBeVisible();
  const confirm = closing.getByRole("button", { name: "Confirmar fechamento" });
  await expect(confirm).toBeDisabled();
  await closing.getByLabel("Justificativa da diferença").fill("Troco dado a mais para um paciente");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect.poll(async () => (await registerRows())[0]?.status, { timeout: 15_000 }).toBe("CLOSED");
  const [closed] = await sql<{ difference_minor: string; justification: string }>(
    `SELECT c.difference_minor::text, c.justification FROM cash_register_closing c
       JOIN cash_register r ON r.id = c.register_id WHERE r.unit_id = $1 AND r.business_date = $2::date`,
    [unit.id, today],
  );
  expect(closed).toEqual({ difference_minor: "-1500", justification: "Troco dado a mais para um paciente" });
  await page.reload();
  await expect(page.getByText("Fechado", { exact: true }).first()).toBeVisible();
});

test("F11: a closed register blocks a new payment with the F09 message and a manager reopens it", async ({
  page,
  browser,
}) => {
  const chargeId = await insertCharge(5_000);
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule/);
  await receiveInFull(page, chargeId, "Pix", 5_000);
  await expect(
    page.getByText(/^O caixa da unidade .+ de hoje já foi fechado\. Solicite a reabertura a um gestor\.$/),
  ).toBeVisible();
  const [blocked] = await sql<{ n: string }>(`SELECT count(*)::text AS n FROM payment WHERE charge_id = $1`, [
    chargeId,
  ]);
  expect(blocked?.n).toBe("0");

  // The Administrator, acting as the manager, reopens the register with a reason.
  const manager = await signedIn(browser, { email: ADMIN.email, password: ADMIN_PASSWORD });
  await manager.goto("/financial/cash");
  await manager.waitForLoadState("networkidle");
  await manager.getByRole("button", { name: "Reabrir caixa" }).click();
  const dialog = manager.getByRole("dialog", { name: "Reabrir caixa" });
  await dialog.getByLabel("Motivo").fill("Pagamento lançado depois do fechamento");
  await dialog.getByRole("button", { name: "Confirmar reabertura" }).click();
  await expect.poll(async () => (await registerRows())[0]?.status, { timeout: 15_000 }).toBe("OPEN");
  await manager.reload();
  await expect(manager.getByText("Reabertura").first()).toBeVisible();
  await expect(manager.getByText("Fechamento 1").first()).toBeVisible();
  await manager.context().close();

  // The payment now goes through.
  await receiveInFull(page, chargeId, "Pix", 5_000);
  await expect
    .poll(
      async () =>
        (
          await sql<{ n: string }>(`SELECT count(*)::text AS n FROM payment WHERE charge_id = $1`, [chargeId])
        )[0]?.n,
      { timeout: 15_000 },
    )
    .toBe("1");
});

test("F11: a manager creates a monthly expense, marks one as paid and sees it in the statement", async ({
  browser,
}) => {
  const manager = await signedIn(browser, { email: ADMIN.email, password: ADMIN_PASSWORD });
  await manager.goto("/financial/expenses");
  await manager.waitForLoadState("networkidle");
  await expect(manager.getByRole("heading", { name: "Despesas", level: 1 })).toBeVisible();

  await manager.getByRole("button", { name: "Nova despesa" }).click();
  const form = manager.getByRole("dialog", { name: "Nova despesa" });
  await form.getByLabel("Descrição", { exact: true }).fill("Aluguel E2E");
  await pickOption(manager, "Categoria", "Aluguel", form);
  await typeMoney(manager, "Valor", 350_000);
  await form.getByLabel("Vencimento").fill(today);
  await form.getByLabel("Repetir todo mês").click();
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect
    .poll(async () => (await sql(`SELECT 1 FROM financial_entry WHERE description = 'Aluguel E2E'`)).length, {
      timeout: 15_000,
    })
    .toBe(12);

  // The occurrence due today is paid by Pix.
  const row = manager.getByRole("row").filter({ hasText: "Aluguel E2E" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Marcar como pago" }).click();
  const pay = manager.getByRole("dialog", { name: "Marcar como pago" });
  await pickOption(manager, "Forma de pagamento", "Pix");
  await pay.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await sql<{ n: string }>(
            `SELECT count(*)::text AS n FROM financial_entry_payment p JOIN financial_entry e ON e.id = p.entry_id
              WHERE e.description = 'Aluguel E2E' AND p.reversed_at IS NULL`,
          )
        )[0]?.n,
      { timeout: 15_000 },
    )
    .toBe("1");

  // The statement of the month lists the payment of the day and starts from the previous balance.
  await manager.goto("/financial/statement");
  await manager.waitForLoadState("networkidle");
  await expect(manager.getByRole("heading", { name: "Extrato", level: 1 })).toBeVisible();
  await expect(manager.getByRole("cell", { name: "Saldo anterior" })).toBeVisible();
  await expect(manager.getByRole("row").filter({ hasText: "Aluguel E2E" }).first()).toBeVisible();
  await expect(manager.getByText("Resultado do período")).toBeVisible();
  await manager.context().close();
});
