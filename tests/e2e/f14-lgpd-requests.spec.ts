import { readFile } from "node:fs/promises";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readZipEntries, readZipFile } from "../zip-reader";
import { e2eEnv } from "./env";
import { signIn, sql } from "./support";
import { F14_PASSWORD, F14_USERS, f14Fixtures, type F14Fixtures } from "./f14-fixtures";

// F14 LGPD journeys (contract UI-REQUESTS, UI-EXPORT, UI-ANON, E2E-EXPORT, E2E-ANON). The fixtures are
// added to the earlier journeys' clinic with SQL; the worker of global-setup builds the exports.
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

function todayLocal(): string {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date())
    .split("-");
  return `${day}/${month}/${year}`;
}

function localDate(instant: Date): string {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(instant)
    .split("-");
  return `${day}/${month}/${year}`;
}

async function objectExists(key: string): Promise<boolean> {
  const env = e2eEnv();
  const { S3Client } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  try {
    await client.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

const row = (page: Page, requestId: string) =>
  page.locator(`[data-testid="request-row"][data-request-id="${requestId}"]`);

test("F14: administrator registers an access request, generates the export and downloads the ZIP", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const page = await signedIn(browser, "admin");
  await page.goto("/lgpd/requests");
  await expect(page.getByRole("heading", { name: "Solicitações LGPD", level: 1 })).toBeVisible();

  // UI-REQUESTS-01 / E2E-EXPORT-01: record the request in the side panel.
  const reason = "Pedido de acesso aos dados feito no balcão.";
  await page.getByRole("button", { name: "Nova solicitação" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("combobox", { name: "Paciente" }).fill("Bruna Teixeira");
  await panel.getByRole("option", { name: /Bruna Teixeira/ }).click();
  await panel.getByRole("combobox", { name: "Tipo" }).click();
  await page.getByRole("option", { name: "Acesso", exact: true }).click();
  await panel.getByRole("combobox", { name: "Solicitante" }).click();
  await page.getByRole("option", { name: "Paciente", exact: true }).click();
  await panel.getByLabel("Descrição").fill(reason);
  await panel.getByRole("button", { name: "Registrar solicitação" }).click();
  await expect(page.getByText("Solicitação registrada.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const [created] = await sql<{ id: string }>(`SELECT id FROM lgpd_request WHERE description = $1`, [reason]);
  if (!created) throw new Error("request not stored");
  const newRow = row(page, created.id);
  await expect(newRow).toContainText(todayLocal());
  await expect(newRow).toContainText("Bruna Teixeira");
  await expect(newRow).toContainText("Acesso");
  await expect(newRow).toContainText("Paciente");
  await expect(newRow).toContainText("Pendente");
  await expect(newRow.getByRole("cell").last()).toHaveText("—");

  // UI-EXPORT-01: generate, wait for the worker, and the file is offered for 7 days.
  await newRow.getByRole("link", { name: "Bruna Teixeira" }).click();
  await page.getByRole("button", { name: "Gerar exportação" }).click();
  await expect(page.getByTestId("export-status")).toHaveText("Gerando exportação…");
  await expect(page.getByTestId("export-status")).toHaveAttribute("aria-live", "polite");
  const download = page.getByRole("button", { name: "Baixar exportação" });
  await expect(download).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText("Concluída", { exact: true }).first()).toBeVisible();
  const [ready] = await sql<{ ready_at: Date }>(
    `SELECT e.ready_at FROM lgpd_export e WHERE e.request_id = $1 AND e.status = 'READY'`,
    [created.id],
  );
  await expect(
    page.getByText(
      `Disponível até ${localDate(new Date((ready?.ready_at ?? new Date()).getTime() + 7 * 86_400_000))}`,
    ),
  ).toBeVisible();

  // E2E-EXPORT-01: the download carries no part of the patient's name and holds every file.
  const downloaded = page.waitForEvent("download");
  await download.click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/^dados-paciente-[0-9a-f]{6}\.zip$/);
  expect(file.suggestedFilename()).not.toMatch(/bruna|teixeira/i);
  const zip = await readFile((await file.path()) ?? "");
  const names = readZipEntries(zip).map((entry) => entry.name);
  expect(names).toContain("dados.json");
  expect(names).toContain("resumo.pdf");
  expect(names.filter((name) => name.startsWith("arquivos/"))).toHaveLength(5);
  const json = JSON.parse(readZipFile(zip, "dados.json").toString("utf8")) as {
    patient: { fullName: string };
  };
  expect(json.patient.fullName).toBe("Bruna Teixeira");

  await expect
    .poll(
      async () =>
        (await sql(`SELECT 1 FROM audit_event WHERE action = 'EXPORT' AND entity_id = $1`, [created.id]))
          .length,
    )
    .toBe(3);
  const audits = await sql<{ actor_user_id: string | null; metadata: Record<string, unknown> }>(
    `SELECT actor_user_id, metadata FROM audit_event WHERE action = 'EXPORT' AND entity_id = $1 ORDER BY occurred_at`,
    [created.id],
  );
  expect(audits.map((audit) => audit.metadata.phase)).toEqual(["requested", "generated", "downloaded"]);
  expect(audits[2]).toMatchObject({
    actor_user_id: fx.users.admin,
    metadata: { requestedBy: "PATIENT", reason },
  });
  await page.context().close();
});

test("F14: overdue requests are highlighted in the register", async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await signedIn(browser, "admin");
  await page.goto("/lgpd/requests");
  // UI-REQUESTS-02: the default filter is "Abertas".
  await expect(row(page, fx.requests.overdue!)).toContainText("Pendente há 16 dias");
  await expect(row(page, fx.requests.day15!)).not.toContainText("Pendente há");
  await expect(row(page, fx.requests.closedOld!)).toHaveCount(0);
  const ids = await page
    .getByTestId("request-row")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-request-id") ?? ""));
  expect(ids.indexOf(fx.requests.overdue!)).toBeLessThan(ids.indexOf(fx.requests.day15!));
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Todas", exact: true }).click();
  await expect(row(page, fx.requests.closedOld!)).toBeVisible();
  await expect(row(page, fx.requests.closedOld!)).not.toContainText("Pendente há");

  // UI-REQUESTS-03: a description that is too short keeps the panel open.
  const before = await sql(`SELECT 1 FROM lgpd_request`);
  await page.getByRole("button", { name: "Nova solicitação" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Descrição").fill("Cópia");
  await panel.getByRole("button", { name: "Registrar solicitação" }).click();
  await expect(panel.getByText("Descreva a solicitação com pelo menos 10 caracteres.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await sql(`SELECT 1 FROM lgpd_request`)).toHaveLength(before.length);
  await page.keyboard.press("Escape");

  // UI-REQUESTS-05: complete a correction request.
  await page.goto(`/lgpd/requests/${fx.requests.correction}`);
  await page.getByRole("button", { name: "Concluir solicitação" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Resolução").fill("Telefone corrigido no cadastro.");
  await dialog.getByRole("button", { name: "Concluir solicitação" }).click();
  await expect(page.getByText("Solicitação concluída.")).toBeVisible();
  await expect(page.getByText("Concluída", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(todayLocal()).first()).toBeVisible();
  await expect(page.getByText("Telefone corrigido no cadastro.")).toBeVisible();
  await page.context().close();

  // UI-REQUESTS-04: only Administrators reach the register.
  const manager = await signedIn(browser, "manager");
  const response = await manager.goto("/lgpd/requests");
  expect(response?.status()).toBe(403);
  await expect(
    manager.getByRole("heading", { name: "Você não tem permissão para acessar esta página" }),
  ).toBeVisible();
  await expect(manager.getByText("LGPD", { exact: true })).toHaveCount(0);
  await manager.context().close();
});

test("F14: a failed export offers a retry and an expired export is no longer offered", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const page = await signedIn(browser, "admin");
  // UI-EXPORT-02.
  await page.goto(`/lgpd/requests/${fx.requests.exportBroken}`);
  await page.getByRole("button", { name: "Gerar exportação" }).click();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText("Falha na geração", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Baixar exportação" })).toHaveCount(0);
  const [failed] = await sql<{ status: string; object_key: string | null; error_code: string }>(
    `SELECT status, object_key, error_code FROM lgpd_export WHERE request_id = $1`,
    [fx.requests.exportBroken],
  );
  expect(failed).toMatchObject({ status: "FAILED", object_key: null, error_code: "FILE_MISSING" });

  // UI-EXPORT-03: the export past its 7 days is not offered, the fresh one is.
  await page.goto(`/lgpd/requests/${fx.requests.exportExpired}`);
  const expired = page.locator(`[data-testid="export-item"][data-export-id="${fx.exports.expired}"]`);
  await expect(expired).toContainText("Exportação expirada em");
  await expect(expired.getByRole("button", { name: "Baixar exportação" })).toHaveCount(0);
  const fresh = page.locator(`[data-testid="export-item"][data-export-id="${fx.exports.fresh}"]`);
  await expect(fresh.getByRole("button", { name: "Baixar exportação" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar novamente" })).toBeVisible();
  await page.context().close();
});

test("F14: anonymization asks for two confirmations and anonymizes the patient", async ({ browser }) => {
  test.setTimeout(300_000);
  const patientId = fx.patients.anonOk!;
  const [before] = await sql<{ email: string; document_number: string }>(
    `SELECT email, document_number FROM patient WHERE id = $1`,
    [patientId],
  );
  const since = new Date();
  const page = await signedIn(browser, "admin");
  await page.goto(`/lgpd/requests/${fx.requests.anonOk}`);
  // UI-ANON-01: the warning comes before any name field.
  await page.getByRole("button", { name: "Anonimizar paciente" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText(/Esta ação não pode ser desfeita\./)).toBeVisible();
  await expect(dialog.getByLabel("Digite o nome completo do paciente para confirmar")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByLabel("Digite o nome completo do paciente para confirmar").fill("Rafael Mendes Costa");
  await dialog.getByRole("button", { name: "Anonimizar definitivamente" }).click();
  await expect(page.getByText("Paciente anonimizado.")).toBeVisible();
  await expect(page.getByText("Concluída", { exact: true }).first()).toBeVisible();
  await page.goto(`/patients/${patientId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Paciente anonimizado #[0-9A-F]{6}$/);
  await expect(page.getByText("Anonimizado", { exact: true }).first()).toBeVisible();

  // E2E-ANON-01: every identifier is replaced and the audit holds no old value.
  const [after] = await sql<Record<string, string | null | boolean | Date>>(
    `SELECT * FROM patient WHERE id = $1`,
    [patientId],
  );
  expect(String(after?.full_name)).toMatch(/^Paciente anonimizado #[0-9A-F]{6}$/);
  for (const column of [
    "social_name",
    "document_number",
    "rg",
    "email",
    "street",
    "secondary_phone",
    "guardian_name",
    "observations",
  ]) {
    expect(after?.[column] ?? null).toBeNull();
  }
  expect(String(after?.mobile_phone)).not.toMatch(/\d/);
  expect(after?.anonymized_at).not.toBeNull();
  expect(after?.active).toBe(false);
  const audits = await sql<{ text: string }>(
    `SELECT row_to_json(a)::text AS text FROM audit_event a WHERE occurred_at >= $1`,
    [since],
  );
  for (const audit of audits) {
    expect(audit.text).not.toContain("Rafael");
    expect(audit.text).not.toContain(before?.document_number ?? "missing");
    expect(audit.text).not.toContain(before?.email ?? "missing");
  }

  // E2E-ANON-02: the records stay under the anonymized identity; the upload is erased.
  expect(await sql(`SELECT 1 FROM appointment WHERE patient_id = $1`, [patientId])).toHaveLength(1);
  expect(
    await sql(`SELECT 1 FROM charge c JOIN payment p ON p.charge_id = c.id WHERE c.patient_id = $1`, [
      patientId,
    ]),
  ).toHaveLength(1);
  const documents = await sql<{ kind: string; erased_at: Date | null }>(
    `SELECT kind, erased_at FROM patient_document WHERE patient_id = $1`,
    [patientId],
  );
  expect(documents.find((document) => document.kind === "UPLOADED")?.erased_at).not.toBeNull();
  expect(documents.find((document) => document.kind === "GENERATED")?.erased_at).toBeNull();
  expect(await sql(`SELECT 1 FROM consent_record WHERE patient_id = $1`, [patientId])).toHaveLength(1);
  await expect.poll(() => objectExists(fx.keys.erasable), { timeout: 60_000 }).toBe(false);
  await page.getByRole("tab", { name: "Linha do tempo" }).click();
  await expect(
    page.getByTestId("timeline-event").getByRole("heading", { name: "Agendamento" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("timeline-event").getByRole("heading", { name: /^Cobrança .* criada$/ }),
  ).toBeVisible();
  await expect(
    page.getByTestId("timeline-event").getByRole("heading", { name: "Pagamento recebido" }),
  ).toBeVisible();

  // E2E-ANON-03: the database refuses to undo it, and the form is read-only.
  await expect(
    sql(`UPDATE patient SET full_name = 'Rafael Mendes Costa' WHERE id = $1`, [patientId]),
  ).rejects.toThrow();
  const [still] = await sql<{ full_name: string }>(`SELECT full_name FROM patient WHERE id = $1`, [
    patientId,
  ]);
  expect(still?.full_name).toMatch(/^Paciente anonimizado #/);
  await page.getByRole("tab", { name: "Dados" }).click();
  await expect(page.getByRole("button", { name: "Salvar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inativar paciente" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reativar paciente" })).toHaveCount(0);
  await page.context().close();
});

test("F14: anonymization is refused for a mismatched name, future appointments, open charges and clinical records", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const watched = [fx.patients.anonFuture!, fx.patients.anonOpen!, fx.patients.anonName!];
  const snapshot = async () =>
    JSON.stringify(await sql(`SELECT * FROM patient WHERE id = ANY($1::uuid[]) ORDER BY id`, [watched]));
  const before = await snapshot();
  const since = new Date();
  const page = await signedIn(browser, "admin");
  const dialog = page.getByRole("alertdialog");

  // UI-ANON-02: a different name.
  await page.goto(`/lgpd/requests/${fx.requests.anonName}`);
  await page.getByRole("button", { name: "Anonimizar paciente" }).click();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByLabel("Digite o nome completo do paciente para confirmar").fill("Helena Ramos");
  await dialog.getByRole("button", { name: "Anonimizar definitivamente" }).click();
  await expect(dialog.getByText("O nome digitado não confere.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByText("Pendente", { exact: true }).first()).toBeVisible();

  // UI-ANON-05 and 06: future appointments and open charges block, with no name field.
  for (const requestId of [fx.requests.anonFuture, fx.requests.anonOpen]) {
    await page.goto(`/lgpd/requests/${requestId}`);
    await page.getByRole("button", { name: "Anonimizar paciente" }).click();
    await expect(
      dialog.getByText(
        "Cancele os agendamentos futuros e regularize as cobranças em aberto antes de anonimizar.",
      ),
    ).toBeVisible();
    await expect(dialog.getByLabel("Digite o nome completo do paciente para confirmar")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Fechar" }).click();
    await expect(page.getByText("Pendente", { exact: true }).first()).toBeVisible();
  }

  // UI-ANON-03 and 04, E2E-ANON-04: clinical records register legal retention and change nothing.
  for (const [requestId, patientId] of [
    [fx.requests.anonClinical, fx.patients.anonClinical],
    [fx.requests.anonClinicalDoc, fx.patients.anonClinicalDoc],
  ] as const) {
    const [patientBefore] = await sql(`SELECT * FROM patient WHERE id = $1`, [patientId]);
    await page.goto(`/lgpd/requests/${requestId}`);
    await page.getByRole("button", { name: "Anonimizar paciente" }).click();
    await expect(
      dialog.getByText(
        "Este paciente possui registros clínicos, que devem ser mantidos por no mínimo 20 anos (Lei 13.787/2018). A solicitação foi registrada e os dados não clínicos podem ser corrigidos, mas não anonimizados.",
      ),
    ).toBeVisible();
    await expect(dialog.getByLabel("Digite o nome completo do paciente para confirmar")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Fechar" }).click();
    await expect(
      page.getByText("Solicitação registrada — retenção legal", { exact: true }).first(),
    ).toBeVisible();
    const [request] = await sql<{ status: string; completed_at: Date | null }>(
      `SELECT status, completed_at FROM lgpd_request WHERE id = $1`,
      [requestId],
    );
    expect(request?.status).toBe("LEGAL_RETENTION");
    expect(request?.completed_at).not.toBeNull();
    expect(await sql(`SELECT * FROM patient WHERE id = $1`, [patientId])).toEqual([patientBefore]);
    expect(
      await sql(
        `SELECT 1 FROM audit_event WHERE entity_type = 'lgpd_request' AND entity_id = $1 AND action = 'UPDATE'`,
        [requestId],
      ),
    ).toHaveLength(1);
  }

  // E2E-ANON-05: nothing changed for the blocked and mismatched attempts.
  expect(await snapshot()).toBe(before);
  const statuses = await sql<{ status: string }>(
    `SELECT status FROM lgpd_request WHERE id = ANY($1::uuid[])`,
    [[fx.requests.anonFuture, fx.requests.anonOpen, fx.requests.anonName]],
  );
  expect(statuses.map((item) => item.status)).toEqual(["PENDING", "PENDING", "PENDING"]);
  expect(
    await sql(
      `SELECT 1 FROM audit_event WHERE action = 'UPDATE' AND entity_type = 'patient' AND entity_id = ANY($1::uuid[]) AND occurred_at >= $2`,
      [watched, since],
    ),
  ).toHaveLength(0);
  await page.context().close();
});
