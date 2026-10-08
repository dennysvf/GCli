import { expect, test, type Page } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { signIn, sql } from "./support";

// F08 critical journeys. They run after f07-clinical-records.spec.ts (alphabetical order, one
// worker): F05 left "Maria Silva Oliveira" and F06 her appointment with "Ana Paula Lima", and F04 the
// Professional user "Paula Prado", who here becomes the user linked to Ana Paula Lima so a
// professional can issue clinical documents. The link and the patient's CPF are restored afterwards.
const ADMIN_PASSWORD = "senhaAdmin2026";
const PROFESSIONAL = { email: "paula.prado@e2e.gcli", password: "senhaPaula2026" };
const DESK = { email: "carlos.recepcao@e2e.gcli", password: "senhaNova2026" };

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const pdfFile = (name: string) => ({ name, mimeType: "application/pdf", buffer: PDF });

type PatientRow = {
  id: string;
  document_type: string | null;
  document_number: string | null;
  document_country: string | null;
};
let patient: PatientRow;

test.beforeAll(async () => {
  const [row] = await sql<PatientRow>(
    `SELECT id, document_type, document_number, document_country FROM patient WHERE full_name = 'Maria Silva Oliveira'`,
  );
  if (!row) throw new Error("Maria Silva Oliveira is missing");
  patient = row;
  // The certificate journey needs a patient without an identity document.
  await sql(
    `UPDATE patient SET document_type = NULL, document_number = NULL, document_country = NULL WHERE id = $1`,
    [patient.id],
  );
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
  await sql(
    `UPDATE patient SET document_type = $2, document_number = $3, document_country = $4 WHERE id = $1`,
    [patient.id, patient.document_type, patient.document_number, patient.document_country],
  );
});

async function openDocuments(page: Page) {
  await page.goto(`/patients/${patient.id}`);
  await page.getByRole("tab", { name: "Documentos" }).click();
}

const uploadDialog = (page: Page) => page.getByRole("dialog", { name: "Enviar arquivos" });

test("F08: front desk uploads a batch with categories and retries a failed file", async ({ page }) => {
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule/);
  await openDocuments(page);
  await expect(page.getByText("Nenhum documento neste paciente.")).toBeVisible();

  // The second file to reach the bucket loses its connection, once.
  let puts = 0;
  await page.route(
    (url) => url.port === "8333",
    async (route) => {
      if (route.request().method() === "PUT") {
        puts += 1;
        if (puts === 2) return route.abort("failed");
      }
      return route.continue();
    },
  );

  await page.getByRole("button", { name: "Enviar arquivos" }).click();
  const dialog = uploadDialog(page);
  await dialog
    .locator('input[type="file"]')
    .setInputFiles([pdfFile("rg.pdf"), pdfFile("termo.pdf"), pdfFile("exame.pdf")]);
  await expect(dialog.getByRole("listitem")).toHaveCount(3);

  // The exam goes to a clinical category, which Front Desk cannot read afterwards.
  const exam = dialog.getByRole("listitem").filter({ hasText: "exame.pdf" });
  await exam.getByRole("combobox", { name: "Categoria" }).click();
  await page.getByRole("option", { name: "Exame" }).click();
  await expect(exam.getByText("Visível apenas para profissionais autorizados")).toBeVisible();

  await dialog.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(dialog.getByText("Falha no envio")).toHaveCount(1, { timeout: 30_000 });
  await expect(dialog.getByText("Enviado", { exact: true })).toHaveCount(2);

  // The files that were sent are kept, and the failed one is sent again on its own.
  await dialog.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(dialog.getByText("Enviado", { exact: true })).toHaveCount(3, { timeout: 30_000 });
  // The footer button comes first; the corner "X" has the same name.
  await dialog.getByRole("button", { name: "Fechar" }).first().click();

  const table = page.getByRole("table");
  await expect(table.getByRole("row", { name: /rg/ })).toBeVisible();
  await expect(table.getByRole("row", { name: /termo/ })).toBeVisible();
  // The clinical document is not in the list of Front Desk.
  await expect(table.getByText("exame", { exact: true })).toHaveCount(0);
  const stored = await sql<{ n: string }>(
    `SELECT count(*)::text AS n FROM patient_document WHERE patient_id = $1 AND status = 'READY'`,
    [patient.id],
  );
  expect(stored[0]?.n).toBe("3");
});

test("F08: a 21st file and a ZIP are refused with the PRD messages", async ({ page }) => {
  await signIn(page, DESK.email, DESK.password);
  await expect(page).toHaveURL(/\/schedule/);
  await openDocuments(page);
  await page.getByRole("button", { name: "Enviar arquivos" }).click();
  const dialog = uploadDialog(page);

  await dialog
    .locator('input[type="file"]')
    .setInputFiles(Array.from({ length: 21 }, (_, index) => pdfFile(`arquivo-${index}.pdf`)));
  await expect(dialog.getByText("Envie até 20 arquivos por vez.")).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(0);

  await dialog
    .locator('input[type="file"]')
    .setInputFiles([
      { name: "exame.zip", mimeType: "application/zip", buffer: Buffer.from("PK\u0003\u0004") },
    ]);
  await expect(
    dialog.getByText("O arquivo exame.zip não é suportado. Envie PDF, imagens ou DOCX de até 20 MB."),
  ).toBeVisible();
  // A refused file cannot be retried, only removed.
  await expect(dialog.getByRole("button", { name: "Tentar novamente" })).toHaveCount(0);
});

test("F08: a professional issues a certificate with a missing CPF and prints it", async ({ page }) => {
  await signIn(page, PROFESSIONAL.email, PROFESSIONAL.password);
  await expect(page).toHaveURL(/\/schedule/);
  await openDocuments(page);
  await page.getByRole("button", { name: "Emitir documento" }).click();
  const dialog = page.getByRole("dialog", { name: "Emitir documento" });

  // A clinical template is always signed by the user's own profile.
  await expect(dialog.getByRole("combobox", { name: "Modelo" })).toContainText("Atestado");
  await expect(dialog.getByRole("combobox", { name: "Profissional" })).toBeDisabled();
  await expect(dialog.getByText("Em documentos clínicos, o profissional é você.")).toBeVisible();
  await dialog.getByLabel("Dias afastamento").fill("2");

  // The patient has no CPF: the preview marks it by name, and generating asks first.
  const preview = dialog.getByTestId("document-preview");
  await expect(preview.locator("mark[data-missing]")).toContainText("CPF do paciente");
  await expect(preview).toContainText("Maria Silva Oliveira");
  await dialog.getByRole("button", { name: "Gerar PDF" }).click();
  await expect(dialog.getByText("O CPF do paciente não está cadastrado.")).toBeVisible();
  await expect(dialog.getByText("Deseja gerar mesmo assim?")).toBeVisible();

  const popup = page.waitForEvent("popup");
  await dialog.getByRole("button", { name: "Gerar mesmo assim" }).click();
  await popup;

  const row = page.getByRole("row", { name: /Atestado/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("Clínico", { exact: true })).toBeVisible();
  await expect(row.getByText("Emitido", { exact: true })).toBeVisible();
  const issued = await sql<{ kind: string; clinical: boolean; size: number }>(
    `SELECT kind, is_clinical AS clinical, size_bytes AS size FROM patient_document
      WHERE patient_id = $1 AND kind = 'GENERATED'`,
    [patient.id],
  );
  expect(issued).toHaveLength(1);
  expect(issued[0]).toMatchObject({ kind: "GENERATED", clinical: true });
  expect(issued[0]?.size).toBeGreaterThan(1000);
});

test("F08: an administrator archives a document with a reason and restores it", async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN_PASSWORD);
  await expect(page).not.toHaveURL(/\/login/);
  await openDocuments(page);
  const row = page.getByRole("row", { name: /rg/ });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Arquivar" }).click();
  const dialog = page.getByRole("dialog", { name: "Arquivar documento" });
  // The reason is mandatory.
  await expect(dialog.getByRole("button", { name: "Arquivar" })).toBeDisabled();
  await dialog.getByLabel("Motivo").fill("Enviado no paciente errado");
  await dialog.getByRole("button", { name: "Arquivar" }).click();
  await expect(page.getByText("Documento arquivado")).toBeVisible();
  await expect(page.getByRole("row", { name: /rg/ })).toHaveCount(0);

  await page.getByLabel("Mostrar arquivados").click();
  const archived = page.getByRole("row", { name: /rg/ });
  await expect(archived.getByText("Arquivado", { exact: true })).toBeVisible();
  await expect(archived.getByText(/Enviado no paciente errado/)).toBeVisible();

  await archived.getByRole("button", { name: "Restaurar" }).click();
  await expect(page.getByText("Documento restaurado")).toBeVisible();
  await page.getByLabel("Mostrar arquivados").click();
  const restored = page.getByRole("row", { name: /rg/ });
  await expect(restored).toBeVisible();
  await expect(restored.getByText("Arquivado", { exact: true })).toHaveCount(0);
});

test("F08: an administrator creates a template with variables and a free field and issues it", async ({
  page,
}) => {
  await signIn(page, ADMIN.email, ADMIN_PASSWORD);
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/settings/documents");
  await expect(page.getByText(/GB usados/)).toBeVisible();
  await expect(page.getByRole("row", { name: /Atestado/ })).toBeVisible();
  await page.getByRole("link", { name: "Novo modelo" }).click();

  await page.getByLabel("Nome do modelo").fill("Orientações de retorno");
  const editor = page.getByRole("textbox", { name: "Texto do modelo" });
  await editor.click();
  await page.keyboard.type("Olá, ");
  await page.getByRole("button", { name: "Inserir variável" }).click();
  await page.getByRole("menuitem", { name: "Nome do paciente" }).click();
  await expect(editor).toBeFocused();
  await page.keyboard.type(". Volte em: ");
  await page.getByRole("button", { name: "Campo livre" }).click();
  await page.getByLabel("Nome do campo").fill("Prazo");
  await expect(page.getByText("Use letras minúsculas, números e _ (até 40 caracteres).")).toBeVisible();
  await page.getByLabel("Nome do campo").fill("prazo");
  await page.getByRole("button", { name: "Inserir", exact: true }).click();
  await expect(editor).toContainText("{{paciente.nome}}");
  await expect(editor).toContainText("{{campo:prazo}}");
  await page.getByRole("button", { name: "Salvar modelo" }).click();
  await expect(page).toHaveURL(/\/settings\/documents$/);
  await expect(page.getByRole("row", { name: /Orientações de retorno/ })).toBeVisible();

  // Issued for a patient: the free field has its own input and the preview shows the data.
  await openDocuments(page);
  await page.getByRole("button", { name: "Emitir documento" }).click();
  const dialog = page.getByRole("dialog", { name: "Emitir documento" });
  await dialog.getByRole("combobox", { name: "Modelo" }).click();
  await page.getByRole("option", { name: "Orientações de retorno" }).click();
  // A non-clinical template accepts any active professional.
  await dialog.getByRole("combobox", { name: "Profissional" }).click();
  await page.getByRole("option", { name: "Ana Paula Lima" }).click();
  await dialog.getByLabel("Prazo").fill("15 dias");
  const preview = dialog.getByTestId("document-preview");
  await expect(preview).toContainText("Olá, Maria Silva Oliveira. Volte em: 15 dias");
  await expect(preview.locator("mark[data-missing]")).toHaveCount(0);
});
