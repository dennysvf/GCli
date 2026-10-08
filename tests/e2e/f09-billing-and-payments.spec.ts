import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { signIn, sql } from "./support";

// F09 critical journeys. They run after f08-patient-documents.spec.ts (alphabetical order, one
// worker): F06 left "Maria Silva Oliveira" checked in with "Ana Paula Lima", so her appointment
// already has an open charge created by the check-in (F07 only moved it along). The Administrator acts as the manager who approves.
const ADMIN_PASSWORD = "senhaAdmin2026";
const DESK = { email: "carlos.recepcao@e2e.gcli", password: "senhaNova2026" };
const PIN = "402719";

type AppointmentRow = { id: string; unit_id: string; day: string };
let patientId: string;
let appointment: AppointmentRow;

test.beforeAll(async () => {
  const [patient] = await sql<{ id: string }>(
    `SELECT id FROM patient WHERE full_name = 'Maria Silva Oliveira'`,
  );
  if (!patient) throw new Error("Maria Silva Oliveira is missing");
  patientId = patient.id;
  const [row] = await sql<AppointmentRow>(
    `SELECT a.id, a.unit_id, to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day
       FROM appointment a
      JOIN charge c ON c.appointment_id = a.id
      WHERE a.patient_id = $1 AND c.status <> 'CANCELLED'
      ORDER BY a.starts_at LIMIT 1`,
    [patientId],
  );
  if (!row) throw new Error("no appointment of Maria Silva Oliveira with a charge");
  appointment = row;
});

let sequence = 900_000;
// A manual charge created directly, so each journey owns one and they do not depend on each other.
async function insertCharge(grossMinor: number): Promise<string> {
  sequence = 900_000 + Math.floor(Math.random() * 99_000);
  const [row] = await sql<{ id: string }>(
    `INSERT INTO charge (id, organization_id, number, patient_id, origin, description, unit_id, currency,
                         gross_minor, net_minor, status, created_by_id, version)
     SELECT gen_random_uuid(), p.organization_id, $1, p.id, 'MANUAL', 'Taxa E2E',
            (SELECT id FROM unit WHERE currency = 'BRL' AND active ORDER BY created_at LIMIT 1),
            'BRL', $2, $2, 'OPEN', (SELECT id FROM app_user WHERE email = $3), 1
       FROM patient p WHERE p.id = $4
     RETURNING id`,
    [`2026-${sequence}`, grossMinor, DESK.email, patientId],
  );
  if (!row) throw new Error("charge not inserted");
  return row.id;
}

// MoneyInput fills digits from the right: typing "20000" shows 200,00.
async function typeMoney(page: Page, label: string | RegExp, minor: number, index = 0) {
  const field = page.getByLabel(label, { exact: typeof label === "string" }).nth(index);
  await field.click();
  await field.press("Control+A");
  await field.pressSequentially(String(minor));
}

async function pickOption(page: Page, label: string, option: string, index = 0) {
  await page.getByLabel(label, { exact: true }).nth(index).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const receiveDialog = (page: Page) => page.getByRole("dialog", { name: "Receber pagamento" });

async function signedIn(browser: Browser, user: { email: string; password: string }) {
  const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await context.newPage();
  await signIn(page, user.email, user.password);
  await expect(page).toHaveURL(/\/(schedule|dashboard|patients|financial)/);
  return page;
}

test("F09: front desk checks in, receives with two methods and prints the receipt", async ({ page }) => {
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule/);
  await page.goto(
    `/schedule?unit=${appointment.unit_id}&date=${appointment.day}&appointment=${appointment.id}`,
  );

  const section = page.getByRole("region", { name: "Cobrança" });
  await expect(section.getByText("Em aberto")).toBeVisible({ timeout: 20_000 });
  const [charge] = await sql<{ id: string; net_minor: string }>(
    `SELECT id, net_minor::text FROM charge WHERE appointment_id = $1`,
    [appointment.id],
  );
  if (!charge) throw new Error("the check-in did not create a charge");

  await section.getByRole("button", { name: "Receber" }).click();
  const dialog = receiveDialog(page);
  await expect(dialog).toBeVisible();
  // Two lines: R$ 1,00 in Pix and the rest on the credit card in 3 installments.
  await pickOption(page, "Forma de pagamento", "Pix");
  await typeMoney(page, "Valor", 100);
  await dialog.getByRole("button", { name: "Adicionar forma de pagamento" }).click();
  await pickOption(page, "Forma de pagamento", "Cartão de crédito", 1);
  await dialog.getByLabel("Parcelas").fill("3");
  await expect(dialog.getByText("Saldo restante: R$ 0,00")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar recebimento" }).click();

  await expect(page.getByText("Pagamento registrado")).toBeVisible();
  await expect(section.getByText("Pago", { exact: true })).toBeVisible();
  const payments = await sql<{ method: string; installments: number | null }>(
    `SELECT method, installments FROM payment WHERE charge_id = $1 ORDER BY amount_minor`,
    [charge.id],
  );
  expect(payments.map((payment) => payment.method)).toEqual(["PIX", "CREDIT_CARD"]);
  expect(payments[1]?.installments).toBe(3);

  // "Imprimir recibo" opens the PDF of the charge.
  const response = await page.request.get(`/api/billing/charges/${charge.id}/receipt`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("F09: an overpayment shows the PRD message and a double click records one payment", async ({ page }) => {
  const chargeId = await insertCharge(20_000);
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule/);
  await page.goto(`/financial/charges/${chargeId}`);
  await page.getByRole("button", { name: "Receber" }).click();
  const dialog = receiveDialog(page);
  await pickOption(page, "Forma de pagamento", "Dinheiro");

  await typeMoney(page, "Valor", 25_000);
  await expect(
    dialog.getByText("O valor informado (R$ 250,00) é maior que o saldo em aberto (R$ 200,00)."),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirmar recebimento" })).toBeDisabled();

  await typeMoney(page, "Valor", 20_000);
  await dialog.getByRole("button", { name: "Confirmar recebimento" }).dblclick();
  // The toast of an earlier journey may still be on screen, so the database is the witness.
  await expect
    .poll(
      async () =>
        (
          await sql<{ n: string }>(`SELECT count(*)::text AS n FROM payment WHERE charge_id = $1`, [chargeId])
        )[0]?.n,
    )
    .toBe("1");
  await page.waitForTimeout(1500);
  const rows = await sql<{ n: string }>(`SELECT count(*)::text AS n FROM payment WHERE charge_id = $1`, [
    chargeId,
  ]);
  expect(rows[0]?.n).toBe("1");
});

test("F09: front desk requests a 30% discount and a manager approves it with the PIN", async ({
  page,
  browser,
}) => {
  // The manager (the Administrator) sets the approval PIN from the user menu.
  const manager = await signedIn(browser, { email: ADMIN.email, password: ADMIN_PASSWORD });
  await manager.getByRole("button", { name: "Menu do usuário" }).click();
  await manager.getByRole("menuitem", { name: "PIN de aprovação" }).click();
  const pinDialog = manager.getByRole("dialog", { name: "PIN de aprovação" });
  await pinDialog.getByLabel("Senha atual").fill(ADMIN_PASSWORD);
  await pinDialog.getByLabel("Novo PIN", { exact: true }).fill(PIN);
  await pinDialog.getByLabel("Confirmar PIN").fill(PIN);
  await pinDialog.getByRole("button", { name: "Salvar PIN" }).click();
  await expect(manager.getByText("PIN de aprovação salvo")).toBeVisible();
  await manager.context().close();

  const chargeId = await insertCharge(20_000);
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule/);
  await page.goto(`/financial/charges/${chargeId}`);
  await page.getByRole("button", { name: "Receber" }).click();
  const dialog = receiveDialog(page);
  await dialog.getByLabel("Desconto (%)").fill("30");
  await dialog.getByLabel("Motivo do desconto").fill("Parceria com a empresa");
  await expect(dialog.getByText("Descontos acima de 20% precisam da aprovação de um gestor.")).toBeVisible();
  await pickOption(page, "Gestor", ADMIN.name);
  await dialog.getByLabel("PIN").fill(PIN);
  await pickOption(page, "Forma de pagamento", "Pix");
  await expect(dialog.getByText("Saldo restante: R$ 0,00")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar recebimento" }).click();

  // An earlier toast may still be on screen, so the database is the witness.
  await expect
    .poll(
      async () =>
        (await sql<{ status: string }>(`SELECT status FROM charge WHERE id = $1`, [chargeId]))[0]?.status,
      { timeout: 15_000 },
    )
    .toBe("PAID");
  const [request] = await sql<{ status: string; method: string }>(
    `SELECT status, method FROM charge_discount_request WHERE charge_id = $1`,
    [chargeId],
  );
  expect(request).toEqual({ status: "APPROVED", method: "PIN" });
  const [paid] = await sql<{ net_minor: string; status: string }>(
    `SELECT net_minor::text, status FROM charge WHERE id = $1`,
    [chargeId],
  );
  expect(paid).toEqual({ net_minor: "14000", status: "PAID" });
});

test("F09: a discount sent for approval is approved from the list", async ({ page, browser }) => {
  const chargeId = await insertCharge(30_000);
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule/);
  await page.goto(`/financial/charges/${chargeId}`);
  await page.getByRole("button", { name: "Receber" }).click();
  const dialog = receiveDialog(page);
  await dialog.getByLabel("Desconto (%)").fill("25");
  await dialog.getByLabel("Motivo do desconto").fill("Pacote promocional");
  await dialog.getByRole("button", { name: "Enviar para aprovação" }).click();
  await expect(page.getByText("Desconto enviado para aprovação")).toBeVisible();

  const manager = await signedIn(browser, { email: ADMIN.email, password: ADMIN_PASSWORD });
  await manager.goto("/financial/approvals");
  const row = manager.getByRole("row").filter({ hasText: "Maria Silva Oliveira" });
  await expect(row).toBeVisible();
  // Buttons ignore clicks until the page is hydrated.
  await manager.waitForLoadState("networkidle");
  await row.getByRole("button", { name: "Aprovar" }).click();
  await expect(manager.getByText("Desconto aprovado")).toBeVisible();
  await expect(manager.getByText("Nenhum desconto aguardando aprovação.")).toBeVisible();
  const [charge] = await sql<{ status: string; net_minor: string }>(
    `SELECT status, net_minor::text FROM charge WHERE id = $1`,
    [chargeId],
  );
  expect(charge).toEqual({ status: "OPEN", net_minor: "22500" });
  await manager.context().close();
});

test("F09: manager refunds a payment and voids a charge", async ({ browser }) => {
  const paidId = await insertCharge(10_000);
  const voidId = await insertCharge(5000);
  const manager = await signedIn(browser, { email: ADMIN.email, password: ADMIN_PASSWORD });

  await manager.goto(`/financial/charges/${paidId}`);
  await manager.getByRole("button", { name: "Receber" }).click();
  await pickOption(manager, "Forma de pagamento", "Dinheiro");
  await manager.getByRole("button", { name: "Confirmar recebimento" }).click();
  await expect(manager.getByText("Pagamento registrado")).toBeVisible();
  await expect(manager.getByText("Pago", { exact: true }).first()).toBeVisible();

  await manager.getByRole("button", { name: "Estornar" }).click();
  const refund = manager.getByRole("dialog", { name: "Estornar pagamento" });
  await refund.getByLabel("Motivo").fill("Procedimento não realizado");
  await refund.getByRole("button", { name: "Estornar" }).click();
  await expect(manager.getByText("Estorno registrado")).toBeVisible();
  const rows = await sql<{ kind: string; amount_minor: string }>(
    `SELECT kind, amount_minor::text FROM payment WHERE charge_id = $1 ORDER BY amount_minor DESC`,
    [paidId],
  );
  expect(rows).toEqual([
    { kind: "PAYMENT", amount_minor: "10000" },
    { kind: "REFUND", amount_minor: "-10000" },
  ]);

  await manager.goto(`/financial/charges/${voidId}`);
  await manager.getByRole("button", { name: "Cancelar cobrança" }).click();
  const voiding = manager.getByRole("dialog", { name: "Cancelar cobrança" });
  await voiding.getByLabel("Motivo").fill("Lançada em duplicidade");
  await voiding.getByRole("button", { name: "Cancelar cobrança" }).click();
  await expect(manager.getByText("Cobrança cancelada")).toBeVisible();
  const [voided] = await sql<{ status: string }>(`SELECT status FROM charge WHERE id = $1`, [voidId]);
  expect(voided?.status).toBe("CANCELLED");
  await manager.context().close();
});
