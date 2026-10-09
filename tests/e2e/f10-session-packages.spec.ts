import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { signIn, sql } from "./support";

// F10 critical journeys. They run after f09-billing-and-payments.spec.ts (alphabetical order, one
// worker): F05 left "Maria Silva Oliveira", F04 the professional "Ana Paula Lima" with "Consulta
// dermatológica" (R$ 250,00, 30 min) working 08:00–12:00 on weekdays. The journeys depend on each
// other: the template and the sold package of the first one are used by the rest.
const ADMIN_PASSWORD = "senhaAdmin2026";
const DESK = { email: "carlos.recepcao@e2e.gcli", password: "senhaNova2026" };
const PROFESSIONAL = { email: "paula.prado@e2e.gcli", password: "senhaPaula2026" };
const PROFESSIONAL_NAME = "Ana Paula Lima";
const TEMPLATE = "Consulta 10 sessões E2E";

function localDate(offset: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}

// The next weekday at least `from` days ahead (the professional works Monday to Friday).
function nextWeekday(from: number): string {
  for (let offset = from; ; offset++) {
    const date = localDate(offset);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return date;
  }
}

// Away from the days used by F06 (2 days ahead) and the professional's vacation (10–14 days ahead).
const day = nextWeekday(4);

let patientId: string;

test.beforeAll(async () => {
  const [patient] = await sql<{ id: string }>(
    `SELECT id FROM patient WHERE full_name = 'Maria Silva Oliveira'`,
  );
  if (!patient) throw new Error("Maria Silva Oliveira is missing");
  patientId = patient.id;
  // A Professional user completes the appointment, so the user becomes the one linked to Ana Paula
  // Lima (F07 does the same); the link is restored afterwards.
  await sql(`UPDATE professional SET linked_user_id = NULL WHERE full_name = 'Paula Prado'`);
  await sql(
    `UPDATE professional SET linked_user_id = (SELECT id FROM app_user WHERE email = $1)
      WHERE full_name = $2`,
    [PROFESSIONAL.email, PROFESSIONAL_NAME],
  );
});

test.afterAll(async () => {
  await sql(`UPDATE professional SET linked_user_id = NULL WHERE full_name = $1`, [PROFESSIONAL_NAME]);
  await sql(
    `UPDATE professional SET linked_user_id = (SELECT id FROM app_user WHERE email = $1)
      WHERE full_name = 'Paula Prado'`,
    [PROFESSIONAL.email],
  );
});

async function signedIn(browser: Browser, user: { email: string; password: string }) {
  const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await context.newPage();
  await signIn(page, user.email, user.password);
  await expect(page).toHaveURL(/\/(schedule|dashboard|patients|financial)/);
  return page;
}

async function openFinance(page: Page) {
  await page.goto(`/patients/${patientId}`);
  await page.getByRole("tab", { name: "Financeiro" }).click();
  await expect(page.getByRole("region", { name: "Pacotes" })).toBeVisible();
  return page.getByRole("region", { name: "Pacotes" });
}

async function openDay(page: Page) {
  await page.goto(`/schedule?view=day&date=${day}`);
  await expect(page.getByRole("heading", { name: "Agenda", level: 1 })).toBeVisible();
}

async function bookWithPackage(page: Page, time: string) {
  await openDay(page);
  const slot = page.getByRole("button", { name: `Agendar às ${time}, ${PROFESSIONAL_NAME}` });
  await expect(slot).toBeVisible();
  await slot.click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("combobox", { name: "Paciente" }).fill("Maria");
  await panel.getByRole("option", { name: /Maria Silva Oliveira/ }).click();
  await panel.getByRole("combobox", { name: "Serviço" }).click();
  await page.getByRole("option", { name: /Consulta dermatológica/ }).click();
  await expect(panel.getByRole("combobox", { name: "Profissional" })).toContainText(PROFESSIONAL_NAME);
  return panel;
}

type PackageRow = { id: string; used: number; status: string };
async function packageOf(): Promise<PackageRow> {
  const [row] = await sql<PackageRow>(
    `SELECT id, used_sessions AS used, status FROM patient_package WHERE name = $1`,
    [TEMPLATE],
  );
  if (!row) throw new Error("the package was not sold");
  return row;
}

test("F10: an administrator creates a template and front desk sells it with a payment", async ({
  browser,
}) => {
  const admin = await signedIn(browser, { email: ADMIN.email, password: ADMIN_PASSWORD });
  await admin.goto("/settings/packages");
  await expect(admin.getByRole("heading", { name: "Pacotes", level: 1 })).toBeVisible();
  await admin.getByRole("button", { name: "Novo modelo" }).click();
  const form = admin.getByRole("dialog", { name: "Novo modelo" });
  await form.getByLabel("Nome").fill(TEMPLATE);
  await form.getByRole("combobox", { name: "Serviço" }).click();
  await admin.getByRole("option", { name: /Consulta dermatológica/ }).click();
  await form.getByLabel("Sessões").fill("10");
  await form.getByLabel("Validade (dias)").fill("180");
  // MoneyInput fills digits from the right: "200000" is R$ 2.000,00.
  const price = form.getByLabel("Preço total em BRL");
  await price.click();
  await price.press("Control+A");
  await price.pressSequentially("200000");
  await expect(price).toHaveValue("R$ 2.000,00");
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect
    .poll(async () => (await sql(`SELECT 1 FROM package_template WHERE name = $1`, [TEMPLATE])).length)
    .toBe(1);
  await admin.context().close();

  const desk = await signedIn(browser, DESK);
  const section = await openFinance(desk);
  await section.getByRole("button", { name: "Vender pacote" }).click();
  const sale = desk.getByRole("dialog", { name: "Vender pacote" });
  await sale.getByRole("combobox", { name: "Modelo" }).click();
  await desk.getByRole("option", { name: new RegExp(TEMPLATE) }).click();
  await sale.getByRole("button", { name: "Vender pacote" }).click();

  // Sold: one package and exactly one charge (origin PACKAGE), then "Receber agora".
  await expect(desk.getByRole("dialog", { name: "Pacote vendido" })).toBeVisible();
  const [sold] = await sql<{ charges: string; origin: string; net: string }>(
    `SELECT count(*)::text AS charges, min(c.origin) AS origin, min(c.net_minor)::text AS net
       FROM charge c JOIN patient_package p ON p.charge_id = c.id WHERE p.name = $1`,
    [TEMPLATE],
  );
  expect(sold).toEqual({ charges: "1", origin: "PACKAGE", net: "200000" });
  await desk.getByRole("button", { name: "Receber agora" }).click();
  const receive = desk.getByRole("dialog", { name: "Receber pagamento" });
  await receive.getByLabel("Forma de pagamento", { exact: true }).click();
  await desk.getByRole("option", { name: "Pix", exact: true }).click();
  await expect(receive.getByText("Saldo restante: R$ 0,00")).toBeVisible();
  await receive.getByRole("button", { name: "Confirmar recebimento" }).click();
  await expect
    .poll(
      async () =>
        (
          await sql<{ status: string }>(
            `SELECT c.status FROM charge c JOIN patient_package p ON p.charge_id = c.id WHERE p.name = $1`,
            [TEMPLATE],
          )
        )[0]?.status,
      { timeout: 15_000 },
    )
    .toBe("PAID");
  await desk.reload();
  await desk.getByRole("tab", { name: "Financeiro" }).click();
  const card = desk.getByRole("article", { name: TEMPLATE });
  await expect(card.getByText("Pago", { exact: true })).toBeVisible();
  await expect(card.getByText("0 de 10 sessões")).toBeVisible();
  await desk.context().close();
});

test("F10: front desk books with the package and the check-in creates no charge", async ({ browser }) => {
  const desk = await signedIn(browser, DESK);
  const panel = await bookWithPackage(desk, "09:00");
  await expect(panel.getByRole("radio", { name: "Usar pacote (10 de 10 sessões restantes)" })).toBeVisible();
  await panel.getByRole("radio", { name: "Usar pacote (10 de 10 sessões restantes)" }).click();
  await panel.getByRole("button", { name: "Agendar", exact: true }).click();

  const block = desk.getByRole("button", { name: /^Maria Silva Oliveira, Consulta dermatológica, 09:00/ });
  await expect(block).toContainText("Sessão 1/10");
  await block.click();
  await desk.getByRole("dialog").getByRole("button", { name: "Chegou" }).click();
  await expect
    .poll(
      async () =>
        (
          await sql<{ status: string }>(
            `SELECT a.status FROM appointment a JOIN package_appointment l ON l.appointment_id = a.id`,
          )
        )[0]?.status,
    )
    .toBe("CHECKED_IN");
  const [charges] = await sql<{ n: string }>(
    `SELECT count(*)::text AS n FROM charge c
       JOIN appointment a ON a.id = c.appointment_id
       JOIN package_appointment l ON l.appointment_id = a.id`,
  );
  expect(charges?.n).toBe("0");
  await desk.context().close();
});

test("F10: completing a linked appointment debits one session", async ({ browser }) => {
  const pro = await signedIn(browser, PROFESSIONAL);
  await openDay(pro);
  await pro.getByRole("button", { name: /^Maria Silva Oliveira, Consulta dermatológica, 09:00/ }).click();
  const details = pro.getByRole("dialog");
  await details.getByRole("button", { name: "Iniciar atendimento" }).click();
  await expect(details.getByRole("cell", { name: "EM ATENDIMENTO" })).toBeVisible();
  await details.getByRole("button", { name: "Concluir" }).click();
  await expect.poll(async () => (await packageOf()).used, { timeout: 15_000 }).toBe(1);
  const [link] = await sql<{ status: string }>(`SELECT status FROM package_appointment`);
  expect(link?.status).toBe("DEBITED");
  await pro.context().close();

  const desk = await signedIn(browser, DESK);
  const section = await openFinance(desk);
  await expect(section.getByText("1 de 10 sessões").first()).toBeVisible();
  await desk.context().close();
});

test("F10: a manager cancels a package and its open appointments lose the link", async ({ browser }) => {
  const desk = await signedIn(browser, DESK);
  const panel = await bookWithPackage(desk, "10:00");
  await panel.getByRole("radio", { name: "Usar pacote (9 de 10 sessões restantes)" }).click();
  await panel.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(
    desk.getByRole("button", { name: /^Maria Silva Oliveira, Consulta dermatológica, 10:00/ }),
  ).toContainText("Sessão 2/10");
  await desk.context().close();

  const admin = await signedIn(browser, { email: ADMIN.email, password: ADMIN_PASSWORD });
  const section = await openFinance(admin);
  await section.getByRole("button", { name: "Cancelar pacote" }).click();
  const dialog = admin.getByRole("dialog", { name: "Cancelar pacote" });
  await dialog.getByLabel("Motivo").fill("Paciente desistiu do tratamento");
  // The first confirmation asks for the unlink; the server message carries the number of
  // appointments.
  await dialog.getByRole("button", { name: "Cancelar pacote" }).click();
  await expect(dialog.getByRole("button", { name: "Confirmar cancelamento" })).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar cancelamento" }).click();

  await expect.poll(async () => (await packageOf()).status, { timeout: 15_000 }).toBe("CANCELLED");
  const links = await sql<{ status: string }>(`SELECT status FROM package_appointment ORDER BY linked_at`);
  expect(links.map((link) => link.status)).toEqual(["DEBITED", "UNLINKED_CANCELLED"]);

  await openDay(admin);
  await expect(
    admin.getByRole("button", { name: /^Maria Silva Oliveira, Consulta dermatológica, 10:00/ }),
  ).not.toContainText("Sessão");
  await admin.context().close();
});
