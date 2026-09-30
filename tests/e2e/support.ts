import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { e2eEnv, MAILPIT_URL } from "./env";

type MailpitMessage = { ID: string; To: { Address: string }[]; Subject: string; Created: string };

// Waits for the newest email to an address (delivered by the worker) and returns its first link.
export async function linkFromEmail(to: string, pathPrefix: string, after = new Date(0)): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const list = (await (await fetch(`${MAILPIT_URL}/api/v1/messages`)).json()) as {
          messages: MailpitMessage[];
        };
        const message = list.messages.find(
          (item) => item.To.some((recipient) => recipient.Address === to) && new Date(item.Created) >= after,
        );
        if (!message) return false;
        const body = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)).json()) as {
          Text: string;
        };
        link = body.Text.match(new RegExp(`https?://\\S+${pathPrefix.replace("?", "\\?")}\\S+`))?.[0];
        return !!link;
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBe(true);
  if (!link) throw new Error(`no ${pathPrefix} link for ${to}`);
  return link;
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

export async function setPassword(page: Page, password: string, submitLabel: string) {
  await page.getByLabel("Nova senha").fill(password);
  await page.getByLabel("Confirme a senha").fill(password);
  await page.getByRole("button", { name: submitLabel }).click();
}

// Direct database access for scenarios the UI cannot produce quickly (e.g. an expired session).
export async function sql<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = new Pool({ connectionString: e2eEnv().DATABASE_URL, max: 1 });
  try {
    return (await pool.query(text, params)).rows as T[];
  } finally {
    await pool.end();
  }
}
