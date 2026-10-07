import { expect, test, type Page } from "@playwright/test";
import { signIn, sql } from "./support";

// F07 critical journeys. Run after f06-scheduling.spec.ts (alphabetical order, one worker): F06
// left "Maria Silva Oliveira" checked in with "Ana Paula Lima", plus "Joana Encaixe Teste" booked
// with her, and F04 the Professional user "Paula Prado", who here becomes the user linked to Ana
// Paula Lima so a professional can write her notes. The link is restored afterwards.
const PROFESSIONAL = { email: "paula.prado@e2e.gcli", password: "senhaPaula2026" };
const DESK = { email: "carlos.recepcao@e2e.gcli", password: "senhaNova2026" };

// A 1×1 PNG, enough for the thumbnail job.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

type AppointmentRow = { id: string; patient_id: string; unit_id: string; day: string };

async function appointmentOf(patient: string, status?: string): Promise<AppointmentRow> {
  const rows = await sql<AppointmentRow>(
    `SELECT a.id, a.patient_id, a.unit_id,
            to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day
       FROM appointment a
       JOIN patient p ON p.id = a.patient_id
       JOIN professional pr ON pr.id = a.professional_id
      WHERE p.full_name = $1 AND pr.full_name = 'Ana Paula Lima' AND a.status <> 'CANCELLED'
        AND ($2::text IS NULL OR a.status = $2)
        AND NOT EXISTS (SELECT 1 FROM clinical_note n WHERE n.appointment_id = a.id)
      ORDER BY a.starts_at LIMIT 1`,
    [patient, status ?? null],
  );
  const row = rows[0];
  if (!row) throw new Error(`no appointment of ${patient}`);
  return row;
}

test.beforeAll(async () => {
  await sql(`UPDATE professional SET linked_user_id = NULL WHERE full_name = 'Paula Prado'`);
  await sql(
    `UPDATE professional SET linked_user_id = (SELECT id FROM app_user WHERE email = $1)
      WHERE full_name = 'Ana Paula Lima'`,
    [PROFESSIONAL.email],
  );
});

test.afterAll(async () => {
  await sql(`UPDATE professional SET linked_user_id = NULL WHERE full_name = 'Ana Paula Lima'`);
  await sql(
    `UPDATE professional SET linked_user_id = (SELECT id FROM app_user WHERE email = $1)
      WHERE full_name = 'Paula Prado'`,
    [PROFESSIONAL.email],
  );
});

async function openAppointmentPanel(page: Page, row: AppointmentRow) {
  await page.goto(`/schedule?unit=${row.unit_id}&date=${row.day}&appointment=${row.id}`);
}

test("F07: a professional writes, attaches and finalizes a clinical note", async ({ page }) => {
  const appointment = await appointmentOf("Maria Silva Oliveira", "CHECKED_IN");
  await signIn(page, PROFESSIONAL.email, PROFESSIONAL.password);
  await expect(page).toHaveURL(/\/schedule/);

  await openAppointmentPanel(page, appointment);
  await page.getByRole("link", { name: "Abrir prontuário" }).click();
  await expect(page.getByRole("heading", { name: "Prontuário", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maria Silva Oliveira", level: 2 })).toBeVisible();

  // Bold and a list in the editor; the first autosave creates the note.
  const editor = page.getByRole("textbox", { name: "Texto do registro" });
  await editor.click();
  // Typing waits for the editor to hold the focus again after each toolbar click.
  await page.getByRole("button", { name: "Negrito" }).click();
  await expect(editor).toBeFocused();
  await page.keyboard.type("Dor lombar");
  await page.getByRole("button", { name: "Negrito" }).click();
  await expect(editor).toBeFocused();
  await page.keyboard.type(" há 3 semanas.");
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect(editor).toBeFocused();
  await page.keyboard.type("Piora ao sentar");
  await expect(editor).toContainText("Dor lombar há 3 semanas.Piora ao sentar");
  await expect(page.getByText(/Rascunho salvo às \d{2}:\d{2}/)).toBeVisible({ timeout: 30_000 });

  // Attachments go straight to the bucket; the image is processed by the worker.
  await page.locator('input[type="file"]').setInputFiles([
    { name: "exame.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") },
    { name: "foto.png", mimeType: "image/png", buffer: PNG },
  ]);
  await expect(page.getByRole("link", { name: "exame.pdf" })).toBeVisible({ timeout: 30_000 });
  const photo = page.getByRole("listitem").filter({ hasText: "foto.png" });
  await expect(photo).toBeVisible();
  await expect(photo).toContainText("Pronto", { timeout: 60_000 });

  await page.getByRole("button", { name: "Finalizar registro" }).click();
  await expect(page.getByText("Registro finalizado")).toBeVisible();
  await expect(page.getByText(/Finalizado — editável até/)).toBeVisible();
  await expect(page.locator(".note-prose").getByText("Dor lombar")).toBeVisible();

  // The agenda no longer reminds about the record once it is finalized.
  await sql(`UPDATE appointment SET status = 'COMPLETED' WHERE id = $1`, [appointment.id]);
  await openAppointmentPanel(page, appointment);
  await expect(page.getByRole("link", { name: "Abrir prontuário" })).toBeVisible();
  await expect(page.getByText("Você ainda não finalizou o registro deste atendimento.")).toHaveCount(0);
});

test("F07: the completion reminder appears when the note is not finalized", async ({ page }) => {
  const appointment = await appointmentOf("Joana Encaixe Teste");
  await sql(`UPDATE appointment SET status = 'COMPLETED' WHERE id = $1`, [appointment.id]);
  await signIn(page, PROFESSIONAL.email, PROFESSIONAL.password);
  await expect(page).toHaveURL(/\/schedule/);
  await openAppointmentPanel(page, appointment);
  // PRD F07: a non-blocking reminder after Concluído without a finalized note.
  await expect(page.getByText("Você ainda não finalizou o registro deste atendimento.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir prontuário" })).toBeVisible();
});

test("F07: a locked note accepts only addenda", async ({ page }) => {
  const appointment = await appointmentOf("Joana Encaixe Teste");
  const [note] = await sql<{ id: string }>(
    `INSERT INTO clinical_note (id, organization_id, patient_id, appointment_id, kind, professional_id,
        author_user_id, status, content_html, content_text, characters, created_at, draft_saved_at,
        locks_at, finalized_at)
     SELECT gen_random_uuid(), a.organization_id, a.patient_id, a.id, 'ENCOUNTER', a.professional_id,
        u.id, 'FINALIZED', '<p>Registro antigo.</p>', 'Registro antigo.', 15,
        now() - interval '25 hours', now() - interval '25 hours', now() - interval '1 hour',
        now() - interval '25 hours'
       FROM appointment a, app_user u WHERE a.id = $1 AND u.email = $2
     RETURNING id`,
    [appointment.id, PROFESSIONAL.email],
  );
  await signIn(page, PROFESSIONAL.email, PROFESSIONAL.password);
  await expect(page).toHaveURL(/\/schedule/);
  await page.goto(`/patients/${appointment.patient_id}/records?note=${note?.id}`);

  // PRD F07: read-only after 24 hours, with the lock message and the addendum button.
  await expect(
    page.getByText(/Este registro foi bloqueado em .+ às .+\. Utilize um adendo para complementar\./),
  ).toBeVisible();
  await expect(page.locator(".note-prose").getByText("Registro antigo.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Texto do registro" })).toHaveCount(0);
  await page.getByRole("button", { name: "Adicionar adendo" }).click();
  await page.getByRole("textbox", { name: "Texto do adendo" }).click();
  await page.keyboard.type("Resultado do exame recebido sem alterações.");
  await page.getByRole("button", { name: "Salvar adendo" }).click();
  await expect(page.getByText("Adendo adicionado")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Adendo de Paula Prado em / })).toBeVisible();
  await expect(page.getByText("Resultado do exame recebido sem alterações.")).toBeVisible();
});

test("F07: front desk cannot open a clinical note", async ({ page }) => {
  const appointment = await appointmentOf("Joana Encaixe Teste").catch(() => null);
  const [any] = await sql<{ id: string; patient_id: string }>(
    `SELECT n.id, n.patient_id FROM clinical_note n ORDER BY n.created_at LIMIT 1`,
  );
  const [attachment] = await sql<{ id: string }>(`SELECT id FROM clinical_attachment LIMIT 1`);
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule/);

  const before = await sql<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_event WHERE action = 'PERMISSION_DENIED'`,
  );
  await page.goto(`/patients/${any?.patient_id}/records`);
  await expect(
    page.getByRole("heading", { name: "Você não tem permissão para acessar esta página" }),
  ).toBeVisible();
  const response = await page.request.get(`/api/clinical/attachments/${attachment?.id}`, { maxRedirects: 0 });
  expect(response.status()).toBe(403);
  const after = await sql<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_event WHERE action = 'PERMISSION_DENIED'`,
  );
  expect(Number(after[0]?.n)).toBeGreaterThan(Number(before[0]?.n));

  // The patient page has no Prontuário tab for Front Desk.
  await page.goto(`/patients/${any?.patient_id}`);
  await expect(page.getByRole("tab", { name: "Agendamentos" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Prontuário" })).toHaveCount(0);
  expect(appointment === null || appointment.id !== "").toBe(true);
});

test("F07: an offline draft is sent when the connection returns", async ({ page, context }) => {
  const appointment = await appointmentOf("Joana Encaixe Teste");
  await sql(`UPDATE appointment SET status = 'CHECKED_IN' WHERE id = $1`, [appointment.id]);
  await signIn(page, PROFESSIONAL.email, PROFESSIONAL.password);
  await expect(page).toHaveURL(/\/schedule/);
  await page.goto(`/patients/${appointment.patient_id}/records?appointment=${appointment.id}`);
  await expect(page.getByRole("textbox", { name: "Texto do registro" })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole("textbox", { name: "Texto do registro" }).click();
  await page.keyboard.type("Texto digitado sem conexão.");
  // PRD F07 Error Handling: the banner, and the text kept in this browser.
  await expect(
    page.getByText(
      "Não foi possível salvar o rascunho. Suas alterações estão guardadas neste navegador e serão enviadas quando a conexão voltar.",
    ),
  ).toBeVisible({ timeout: 30_000 });
  expect(
    await page.evaluate(() =>
      Object.keys(window.localStorage).some((key) => key.startsWith("gcli.clinical.backup.")),
    ),
  ).toBe(true);

  await context.setOffline(false);
  await expect(page.getByText(/Rascunho salvo às \d{2}:\d{2}/)).toBeVisible({ timeout: 40_000 });
  const rows = await sql<{ content_text: string }>(
    `SELECT content_text FROM clinical_note WHERE appointment_id = $1`,
    [appointment.id],
  );
  expect(rows[0]?.content_text).toContain("Texto digitado sem conexão.");
  expect(
    await page.evaluate(() =>
      Object.keys(window.localStorage).some((key) => key.startsWith("gcli.clinical.backup.")),
    ),
  ).toBe(false);
});
