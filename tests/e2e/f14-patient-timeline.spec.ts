import { expect, test, type Browser, type Page, type Response } from "@playwright/test";
import { signIn, sql } from "./support";
import {
  ADDENDUM_TEXT,
  F14_PASSWORD,
  F14_USERS,
  f14Fixtures,
  NOTE_TEXT,
  type F14Fixtures,
} from "./f14-fixtures";

// F14 timeline journeys (contract UI-TIMELINE, UI-VISIBILITY, UI-NOTE, UI-FILTER, E2E-TIMELINE,
// E2E-VISIBILITY, E2E-NOTE-READ). The fixtures are added to the earlier journeys' clinic with SQL.
let fx: F14Fixtures;

test.beforeAll(async () => {
  test.setTimeout(600_000);
  fx = await f14Fixtures();
});

async function signedIn(browser: Browser, user: keyof typeof F14_USERS): Promise<Page> {
  const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await context.newPage();
  await signIn(page, F14_USERS[user].email, F14_PASSWORD);
  await expect(page).toHaveURL(/\/(schedule|dashboard|patients|financial)/);
  return page;
}

const events = (page: Page) => page.getByTestId("timeline-event");
const event = (page: Page, key: string) => page.locator(`[data-testid="timeline-event"][data-key="${key}"]`);

async function openTimeline(page: Page, patientId: string) {
  await page.goto(`/patients/${patientId}`);
  await page.getByRole("tab", { name: "Linha do tempo" }).click();
  await expect(events(page).first()).toBeVisible({ timeout: 20_000 });
}

// Loads every page from the keyboard with "Carregar mais eventos" (contract UI-TIMELINE-04 notes:
// the keyboard alternative of the infinite scroll gives the same result).
async function loadAll(page: Page) {
  for (let guard = 0; guard < 300; guard++) {
    const more = page.getByRole("button", { name: "Carregar mais eventos" });
    if (!(await more.isVisible())) break;
    const before = await events(page).count();
    await expect(more).toBeEnabled();
    await more.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => events(page).count(), { timeout: 20_000 }).toBeGreaterThan(before);
  }
  await expect(page.getByText("Fim da linha do tempo.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Carregar mais eventos" })).toHaveCount(0);
}

async function keysOf(page: Page): Promise<string[]> {
  return events(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-key") ?? ""));
}

// The Server Action responses the browser receives (Next.js marks them with the next-action header).
function recordActionResponses(page: Page): string[] {
  const bodies: string[] = [];
  page.on("response", async (response: Response) => {
    const request = response.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) return;
    bodies.push(await response.text().catch(() => ""));
  });
  return bodies;
}

test("F14: a linked administrator scrolls the whole timeline of a patient", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await signedIn(browser, "admin");
  await openTimeline(page, fx.rich.patientId);
  // UI-TIMELINE-03: exactly 50 events on the first page, with "Carregar mais eventos".
  await expect(events(page)).toHaveCount(50);
  await expect(page.getByRole("button", { name: "Carregar mais eventos" })).toBeVisible();

  // UI-TIMELINE-04: scrolling to the end appends the next page; the live region counts.
  await page.getByRole("button", { name: "Carregar mais eventos" }).scrollIntoViewIfNeeded();
  await expect.poll(() => events(page).count(), { timeout: 20_000 }).toBe(100);
  await expect(page.getByTestId("timeline-count")).toHaveText("100 eventos carregados");
  const firstTwoPages = await keysOf(page);
  expect(new Set(firstTwoPages).size).toBe(100);
  // UI-TIMELINE-02: newest first.
  const times = await events(page)
    .locator("time")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("datetime") ?? ""));
  for (let index = 1; index < times.length; index++) expect(times[index]! <= times[index - 1]!).toBe(true);
  expect(firstTwoPages.indexOf(`APPOINTMENT:${fx.rich.appointments.future}`)).toBeLessThan(
    firstTwoPages.indexOf(`APPOINTMENT:${fx.rich.appointments.history}`),
  );

  // UI-TIMELINE-05 and 01: every page until the end, with every event type.
  await loadAll(page);
  for (const title of [
    "Paciente cadastrado",
    "Consentimento registrado",
    "Agendamento",
    "Registro clínico finalizado",
    "Adendo adicionado",
    "Documento enviado",
    "Documento emitido",
    `Cobrança ${fx.rich.chargeNumber} criada`,
    "Pagamento recebido",
    "Estorno registrado",
  ]) {
    await expect(events(page).getByRole("heading", { name: title, exact: true }).first()).toBeVisible();
  }
  const all = await keysOf(page);
  expect(all.at(-1)).toMatch(/^PATIENT_REGISTERED:/);
  expect(new Set(all).size).toBe(all.length);

  // UI-TIMELINE-06: the status history of the appointment.
  const history = event(page, `APPOINTMENT:${fx.rich.appointments.history}`);
  await expect(history.getByText("Concluído", { exact: true })).toBeVisible();
  await history.getByRole("button", { name: "Ver histórico" }).click();
  const table = history.getByRole("table");
  for (const status of ["Agendado", "Confirmado", "Chegou", "Em atendimento", "Concluído"]) {
    await expect(table.getByText(status, { exact: true })).toBeVisible();
  }
  await expect(table.getByRole("row")).toHaveCount(6);
  await expect(table.getByText("Recepção F14").first()).toBeVisible();
  await expect(table.getByText("Dra. Paula").first()).toBeVisible();

  // UI-TIMELINE-07: a collapsed clinical item shows no clinical text.
  const note = event(page, `CLINICAL_NOTE_FINALIZED:${fx.rich.notes.paula}`);
  await expect(note).toContainText("Dra. Paula");
  await expect(note).toContainText("Consulta");
  await expect(note).not.toContainText(NOTE_TEXT);
  await expect(note.getByRole("button", { name: "Ver registro" })).toHaveAttribute("aria-expanded", "false");
  await page.context().close();
});

test("F14: front desk sees the timeline without clinical items", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await signedIn(browser, "desk");
  const bodies = recordActionResponses(page);
  await openTimeline(page, fx.rich.patientId);
  await loadAll(page);
  // UI-VISIBILITY-01.
  await expect(events(page).getByRole("heading", { name: "Registro clínico finalizado" })).toHaveCount(0);
  await expect(events(page).getByRole("heading", { name: "Adendo adicionado" })).toHaveCount(0);
  await expect(page.getByText(/Exame de sangue/)).toHaveCount(0);
  await expect(page.getByText(/RG digitalizado/).first()).toBeVisible();
  await expect(page.getByText(/^Atestado/).first()).toBeVisible();
  await expect(
    events(page).getByRole("heading", { name: `Cobrança ${fx.rich.chargeNumber} criada` }),
  ).toBeVisible();
  await expect(events(page).getByRole("heading", { name: "Pagamento recebido" }).first()).toBeVisible();
  await expect(events(page).getByRole("heading", { name: "Estorno registrado" }).first()).toBeVisible();
  const filters = page.getByRole("group", { name: "Filtros da linha do tempo" });
  await expect(filters.getByLabel("Registros clínicos")).toHaveCount(0);

  // E2E-VISIBILITY-01: every option of the event type filter in turn, every page.
  const options = ["Cadastro e consentimento", "Agendamentos", "Documentos", "Financeiro"];
  for (const only of options) {
    for (const option of options) {
      const box = filters.getByLabel(option);
      const checked = (await box.getAttribute("data-state")) === "checked";
      if ((option === only) !== checked) await box.click();
    }
    await expect(events(page).first()).toBeVisible();
    await loadAll(page);
  }
  const received = bodies.join("\n");
  expect(bodies.length).toBeGreaterThan(5);
  expect(received).not.toContain(fx.rich.notes.paula);
  expect(received).not.toContain(fx.rich.addendumId);
  expect(received).not.toContain("Exame de sangue");
  expect(received).not.toContain(NOTE_TEXT);
  await page.context().close();
});

test("F14: a professional sees no financial items and expands a clinical note", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await signedIn(browser, "pro");
  const bodies = recordActionResponses(page);
  const noteReads = async () =>
    (
      await sql<{ total: string }>(
        `SELECT count(*)::text AS total FROM audit_event
         WHERE action = 'READ_SENSITIVE' AND entity_type = 'clinical_note' AND entity_id = $1`,
        [fx.rich.notes.paula],
      )
    )[0]?.total;
  const before = Number(await noteReads());
  const startedAt = new Date();

  // E2E-NOTE-READ-03: listing is one audited read of the patient, not of the note.
  await openTimeline(page, fx.rich.patientId);
  await expect(events(page)).toHaveCount(50);
  expect(Number(await noteReads())).toBe(before);
  const patientReads = await sql<{ metadata: { noteIds?: string[] } }>(
    `SELECT metadata FROM audit_event
     WHERE action = 'READ_SENSITIVE' AND entity_type = 'patient' AND entity_id = $1 AND occurred_at >= $2`,
    [fx.rich.patientId, startedAt],
  );
  expect(patientReads.some((row) => row.metadata.noteIds?.includes(fx.rich.notes.paula))).toBe(true);

  // UI-NOTE-01 and E2E-NOTE-READ-01: expanding is an audited read by this user, with a timestamp.
  // The IP address comes only from a trusted proxy (F01, TRUST_PROXY), which the E2E server does
  // not have, so its presence is covered by tests/integration/privacy/note-read.test.ts.
  const note = event(page, `CLINICAL_NOTE_FINALIZED:${fx.rich.notes.paula}`);
  await note.getByRole("button", { name: "Ver registro" }).click();
  await expect(note.getByText(NOTE_TEXT)).toBeVisible();
  await expect(note.getByText(ADDENDUM_TEXT)).toBeVisible();
  await expect(note.getByText(/^Adendo de Dra\. Paula em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeVisible();
  await expect(note.getByRole("button", { name: "Ocultar registro" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect.poll(async () => Number(await noteReads())).toBe(before + 1);
  const [read] = await sql<{ actor_user_id: string; occurred_at: Date }>(
    `SELECT actor_user_id, occurred_at FROM audit_event
     WHERE action = 'READ_SENSITIVE' AND entity_type = 'clinical_note' AND entity_id = $1
     ORDER BY occurred_at DESC LIMIT 1`,
    [fx.rich.notes.paula],
  );
  expect(read?.actor_user_id).toBe(fx.users.pro);
  expect(read?.occurred_at).toBeTruthy();

  // UI-NOTE-02 and E2E-NOTE-READ-02: collapsing hides the text; each expansion is a new read.
  await note.getByRole("button", { name: "Ocultar registro" }).click();
  await expect(note.getByText(NOTE_TEXT)).toHaveCount(0);
  await expect(note.getByRole("button", { name: "Ver registro" })).toHaveAttribute("aria-expanded", "false");
  await note.getByRole("button", { name: "Ver registro" }).click();
  await expect(note.getByText(NOTE_TEXT)).toBeVisible();
  await expect.poll(async () => Number(await noteReads())).toBe(before + 2);

  // UI-VISIBILITY-02 and 03, E2E-VISIBILITY-02: no financial event; only her own appointments.
  await loadAll(page);
  await expect(events(page).getByRole("heading", { name: /^Cobrança/ })).toHaveCount(0);
  await expect(events(page).getByRole("heading", { name: "Pagamento recebido" })).toHaveCount(0);
  await expect(events(page).getByRole("heading", { name: "Estorno registrado" })).toHaveCount(0);
  const filters = page.getByRole("group", { name: "Filtros da linha do tempo" });
  await expect(filters.getByLabel("Financeiro")).toHaveCount(0);
  await expect(event(page, `CLINICAL_ADDENDUM_ADDED:${fx.rich.addendumId}`)).toBeVisible();
  await expect(events(page).getByRole("heading", { name: "Consentimento registrado" })).toBeVisible();
  await expect(event(page, `APPOINTMENT:${fx.rich.appointments.history}`)).toBeVisible();
  await expect(event(page, `APPOINTMENT:${fx.rich.appointments.helena}`)).toHaveCount(0);
  await expect(event(page, `CLINICAL_NOTE_FINALIZED:${fx.rich.notes.helena}`)).toContainText("Dra. Helena");
  for (const only of ["Cadastro e consentimento", "Agendamentos", "Registros clínicos", "Documentos"]) {
    for (const option of ["Cadastro e consentimento", "Agendamentos", "Registros clínicos", "Documentos"]) {
      const box = filters.getByLabel(option);
      const checked = (await box.getAttribute("data-state")) === "checked";
      if ((option === only) !== checked) await box.click();
    }
    await expect(events(page).first()).toBeVisible();
    await loadAll(page);
  }
  const received = bodies.join("\n");
  expect(received).not.toContain("CHARGE_CREATED");
  expect(received).not.toContain("PAYMENT_RECEIVED");
  expect(received).not.toContain("PAYMENT_REFUNDED");
  expect(received).not.toContain(fx.rich.chargeNumber);
  await page.context().close();
});

test("F14: the timeline filters by event type and period", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await signedIn(browser, "admin");
  await openTimeline(page, fx.rich.patientId);
  const filters = page.getByRole("group", { name: "Filtros da linha do tempo" });

  // UI-FILTER-01: only "Documentos".
  for (const option of ["Cadastro e consentimento", "Agendamentos", "Registros clínicos", "Financeiro"]) {
    await filters.getByLabel(option).click();
  }
  await expect(events(page)).toHaveCount(3);
  const titles = await events(page).getByRole("heading").allTextContents();
  expect(titles.every((title) => title === "Documento enviado" || title === "Documento emitido")).toBe(true);
  for (const document of ["Exame de sangue", "RG digitalizado", "Atestado"]) {
    await expect(page.getByText(new RegExp(`^${document} ·`))).toBeVisible();
  }
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(events(page)).toHaveCount(50);

  // UI-FILTER-02: the local date of appt-history.
  const [row] = await sql<{ day: string }>(
    `SELECT to_char(starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day FROM appointment WHERE id = $1`,
    [fx.rich.appointments.history],
  );
  const day = row?.day ?? "";
  await page.getByLabel("De", { exact: true }).fill(day);
  await page.getByLabel("Até", { exact: true }).fill(day);
  await expect(event(page, `APPOINTMENT:${fx.rich.appointments.history}`)).toBeVisible();
  await expect(event(page, `APPOINTMENT:${fx.rich.appointments.future}`)).toHaveCount(0);
  const [year, month, date] = day.split("-");
  const shown = await events(page).locator("time").allTextContents();
  expect(shown.every((text) => text.startsWith(`${date}/${month}/${year}`))).toBe(true);

  // UI-FILTER-03: a period ending before it starts keeps the list.
  const listed = await events(page).count();
  // The fixture dates are relative to "now", so the inverted period is built from the day already
  // in "Até": moving "De" one day past it is invalid at once, with no valid in-between range that
  // would reload the list.
  const dayAfter = new Date(`${day}T12:00:00Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  await page.getByLabel("De", { exact: true }).fill(dayAfter.toISOString().slice(0, 10));
  await expect(page.getByText("A data final deve ser igual ou posterior à data inicial.")).toBeVisible();
  await expect(events(page)).toHaveCount(listed);

  // UI-FILTER-04: a period without events.
  await page.getByLabel("De", { exact: true }).fill("2020-01-01");
  await page.getByLabel("Até", { exact: true }).fill("2020-01-31");
  await expect(page.getByText("Nenhum evento para os filtros selecionados.")).toBeVisible();
  await expect(events(page)).toHaveCount(0);
  await page.context().close();
});

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

test("F14: the timeline loads within 2 seconds for a patient with a long history", async ({ browser }) => {
  test.setTimeout(1_500_000);
  const [{ total } = { total: "0" }] = await sql<{ total: string }>(
    `SELECT count(*)::text AS total FROM appointment`,
  );
  expect(Number(total)).toBeGreaterThanOrEqual(54_000);
  for (const user of ["admin", "desk", "pro"] as const) {
    const page = await signedIn(browser, user);
    const first: number[] = [];
    const next: number[] = [];
    // The first run is a warm-up and is not counted (contract E2E-TIMELINE-01 notes).
    for (let run = 0; run <= 20; run++) {
      await page.goto(`/patients/${fx.heavy.patientId}`);
      const started = Date.now();
      await page.getByRole("tab", { name: "Linha do tempo" }).click();
      await expect(events(page)).toHaveCount(50, { timeout: 20_000 });
      const opened = Date.now() - started;
      // The next page is requested the way a user does: scrolling the end of the list into view.
      const more = Date.now();
      await page.getByRole("button", { name: "Carregar mais eventos" }).scrollIntoViewIfNeeded();
      await expect(events(page)).toHaveCount(100, { timeout: 20_000 });
      const loaded = Date.now() - more;
      if (run > 0) {
        first.push(opened);
        next.push(loaded);
      }
    }
    console.info(`F14 timeline p95 for ${user}: first page ${p95(first)} ms, next page ${p95(next)} ms`);
    expect(p95(first)).toBeLessThanOrEqual(2_000);
    expect(p95(next)).toBeLessThanOrEqual(2_000);
    await page.context().close();
  }
});
