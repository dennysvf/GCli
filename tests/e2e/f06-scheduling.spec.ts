import { expect, test, type Page } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { signIn } from "./support";

// F06 critical journeys. Run after f05-patients.spec.ts (alphabetical order, one worker): F02
// created "Unidade Centro" (Monday to Friday 08:00–18:00), F04 the professional "Ana Paula Lima"
// with "Consulta dermatológica" (30 min, no room), working 08:00–12:00 on weekdays, and a vacation
// 10–14 days ahead,
// and F05 the patient "Maria Silva Oliveira".
const ADMIN_PASSWORD = "senhaAdmin2026";
const DESK = { email: "carlos.recepcao@e2e.gcli", password: "senhaNova2026" };
const PROFESSIONAL = "Ana Paula Lima";

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

async function openDay(page: Page, date: string) {
  await page.goto(`/schedule?view=day&date=${date}`);
  await expect(page.getByRole("heading", { name: "Agenda", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: `Agendar às 10:00, ${PROFESSIONAL}` })).toBeVisible();
}

async function pickPatient(page: Page, term: string, name: string) {
  const panel = page.getByRole("dialog");
  await panel.getByRole("combobox", { name: "Paciente" }).fill(term);
  await panel.getByRole("option", { name: new RegExp(name) }).click();
}

async function pickService(page: Page) {
  const panel = page.getByRole("dialog");
  await panel.getByRole("combobox", { name: "Serviço" }).click();
  await page.getByRole("option", { name: /Consulta dermatológica/ }).click();
  await expect(panel.getByRole("combobox", { name: "Profissional" })).toContainText(PROFESSIONAL);
}

const day = nextWeekday(2);

test("F06: front desk books from an empty slot, checks the patient in and sees the stamp", async ({
  page,
}) => {
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule$/);
  await openDay(page, day);

  await page.getByRole("button", { name: `Agendar às 10:00, ${PROFESSIONAL}` }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "Agendar consulta" })).toBeVisible();
  await pickPatient(page, "Maria", "Maria Silva Oliveira");
  await pickService(page);
  // PRD F06: end time and price appear as soon as the service is chosen.
  await expect(panel.getByText(/10:00–10:30 · R\$\s?250,00/)).toBeVisible();
  await panel.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(page.getByText("Agendamento criado")).toBeVisible();

  const block = page.getByRole("button", {
    name: /^Maria Silva Oliveira, Consulta dermatológica, 10:00–10:30/,
  });
  await expect(block).toContainText("AGENDADO");
  await block.click();
  const details = page.getByRole("dialog");
  await details.getByRole("button", { name: "Chegou" }).click();
  await expect(page.getByText("Status alterado para Chegou")).toBeVisible();
  await expect(details.getByRole("cell", { name: "CHEGOU" })).toBeVisible();
});

test("F06: front desk confirms an encaixe for a patient registered in the booking panel", async ({
  page,
}) => {
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule$/);
  await openDay(page, day);
  // The 10:00 slot is under Maria's block: design system 10.1 keyboard shortcut "N" books it.
  await page.getByRole("button", { name: `Agendar às 10:00, ${PROFESSIONAL}` }).focus();
  await page.keyboard.press("n");
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Novo paciente" }).click();
  await panel.getByLabel("Nome completo").fill("Joana Encaixe Teste");
  await panel.getByLabel("Data de nascimento").fill("1990-03-15");
  await panel.getByLabel("Celular").fill("11955554444");
  await panel.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(panel.getByText("Joana Encaixe Teste")).toBeVisible();
  await pickService(page);

  // PRD F06: a professional conflict is shown before saving and can be confirmed as encaixe.
  await expect(
    panel.getByText(
      `${PROFESSIONAL} já possui atendimento das 10:00 às 10:30. Deseja registrar como encaixe?`,
    ),
  ).toBeVisible();
  await expect(panel.getByRole("button", { name: "Agendar", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Confirmar encaixe" }).click();
  await panel.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(page.getByText("Agendamento criado")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Joana Encaixe Teste/ })).toContainText("ENCAIXE");
});

test("F06: front desk books a recurring series and reschedules a session by keyboard drag", async ({
  page,
}) => {
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule$/);
  await openDay(page, day);
  await page.getByRole("button", { name: `Agendar às 11:00, ${PROFESSIONAL}` }).click();
  const panel = page.getByRole("dialog");
  await pickPatient(page, "Maria", "Maria Silva Oliveira");
  await pickService(page);
  await panel.getByRole("checkbox", { name: "Repetir agendamento" }).click();
  const weekday =
    ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][new Date(`${day}T12:00:00Z`).getUTCDay()] ?? "";
  await panel.getByRole("checkbox", { name: weekday, exact: true }).click();
  await panel.getByLabel("Número de sessões").fill("3");
  await panel.getByRole("button", { name: "Agendar", exact: true }).click();
  // PRD F06: conflicting sessions (here, the F04 vacation) are listed and must be skipped or
  // re-timed before anything is saved.
  const summary = panel.getByText(/de 3 sessões possuem conflito\./);
  const booked = page.getByText(/^[23] sessões agendadas$/);
  await expect(summary.or(booked)).toBeVisible();
  if (await summary.isVisible()) {
    await expect(panel.getByRole("button", { name: "Agendar sessões" })).toBeDisabled();
    for (const skip of await panel.getByRole("button", { name: "Pular" }).all()) await skip.click();
    await panel.getByRole("button", { name: "Agendar sessões" }).click();
  }
  await expect(booked).toBeVisible();

  // Keyboard drag: space picks up, arrow down moves one slot, space drops; the move is confirmed.
  const block = page.getByRole("button", {
    name: /^Maria Silva Oliveira, Consulta dermatológica, 11:00–11:30/,
  });
  await block.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByRole("heading")).toContainText(/Reagendar para .+, 11:30 com Ana Paula Lima\?/);
  await confirm.getByRole("button", { name: "Reagendar" }).click();
  await expect(page.getByText("Agendamento reagendado")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Maria Silva Oliveira, Consulta dermatológica, 11:30–12:00/ }),
  ).toBeVisible();
});

test("F06: two users see each other's changes within 30 seconds", async ({ page, browser }) => {
  const admin = await (
    await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" })
  ).newPage();
  await signIn(admin, ADMIN.email, ADMIN_PASSWORD);
  await expect(admin).toHaveURL(/\/dashboard$/);
  await openDay(admin, day);

  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule$/);
  await openDay(page, day);
  await page.getByRole("button", { name: `Agendar às 09:00, ${PROFESSIONAL}` }).click();
  await pickPatient(page, "Joana", "Joana Encaixe Teste");
  await pickService(page);
  await page.getByRole("dialog").getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(page.getByText("Agendamento criado")).toBeVisible();

  // PRD F06: open agendas show changes by other users within 30 seconds (polling).
  await expect(
    admin.getByRole("button", { name: /^Joana Encaixe Teste, Consulta dermatológica, 09:00–09:30/ }),
  ).toBeVisible({
    timeout: 35_000,
  });
});
