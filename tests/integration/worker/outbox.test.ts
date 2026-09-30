import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { identity } from "@/modules/identity";
import { db } from "@/shared/db/client";
import { withTransaction } from "@/shared/db/transaction";
import { createSmtpEmailSender } from "@/shared/email/email-sender";
import { fail } from "@/shared/kernel/result";
import { QUEUES } from "@/shared/jobs/queues";
import { sendOutboxEmail } from "@/worker/jobs/email-send";
import { dispatchOutboxBatch } from "@/worker/outbox-dispatcher";
import { closeHelpers, createOrganization, createUser, resetDatabase, signedInContext } from "../helpers";

let boss: PgBoss;

beforeAll(async () => {
  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: "pgboss",
    schedule: false,
    createSchema: false,
  });
  await boss.start();
  await boss.createQueue(QUEUES.emailSend);
});
beforeEach(async () => {
  await resetDatabase();
  await fetch(`${process.env.MAILPIT_API_URL}/api/v1/messages`, { method: "DELETE" });
});
afterAll(async () => {
  await boss.stop({ graceful: false });
  await closeHelpers();
});

type MailpitList = { messages: { To: { Address: string }[]; Subject: string; ID: string }[] };

async function mailbox(): Promise<MailpitList["messages"]> {
  const response = await fetch(`${process.env.MAILPIT_API_URL}/api/v1/messages`);
  return ((await response.json()) as MailpitList).messages;
}

async function deliverQueuedEmails(): Promise<void> {
  const jobs = await boss.fetch<{ outboxId: string; type: string; payload: Record<string, unknown> }>(
    QUEUES.emailSend,
    {
      batchSize: 10,
    },
  );
  const sender = createSmtpEmailSender();
  for (const job of jobs ?? []) {
    await sendOutboxEmail(job.data, sender);
    await boss.complete(QUEUES.emailSend, job.id);
  }
}

describe("outbox delivery", () => {
  it("F01: invitation email is delivered through the outbox and its payload redacted", async () => {
    const org = await createOrganization();
    const admin = await createUser({ organizationId: org, role: "ADMINISTRATOR" });
    const { ctx } = await signedInContext(admin);
    await identity.inviteUser(ctx, {
      name: "Carlos Souza",
      email: "carlos@exemplo.com.br",
      role: "FRONT_DESK",
    });

    expect(await dispatchOutboxBatch(boss)).toBe(1);
    await deliverQueuedEmails();

    const messages = await mailbox();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.To[0]?.Address).toBe("carlos@exemplo.com.br");
    expect(messages[0]?.Subject).toContain("Convite");
    const body = await (
      await fetch(`${process.env.MAILPIT_API_URL}/api/v1/message/${messages[0]?.ID}`)
    ).json();
    expect((body as { Text: string }).Text).toContain("/invite?token=");

    const row = await db().outboxMessage.findFirstOrThrow({});
    expect(row.dispatchedAt).not.toBeNull();
    expect(row.payload).toEqual({ redacted: true, type: "email.invitation" });

    // A retried job never sends the same email twice.
    await sendOutboxEmail({ outboxId: row.id, type: row.type, payload: {} }, createSmtpEmailSender());
    expect(await mailbox()).toHaveLength(1);
  });

  it("F01: outbox row from a rolled-back transaction is never sent", async () => {
    const org = await createOrganization();
    await withTransaction(
      { kind: "system", requestId: "r", organizationId: org, ipAddress: null, userAgent: null },
      async (uow) => {
        await uow.outbox.add("email.invitation", { to: "x@exemplo.com.br" });
        return fail({ code: "TEST_ROLLBACK", httpStatus: 400 });
      },
    );
    expect(await db().outboxMessage.count()).toBe(0);
    expect(await dispatchOutboxBatch(boss)).toBe(0);
  });

  it("F01: password reset email reaches the mailbox", async () => {
    const org = await createOrganization();
    const user = await createUser({ organizationId: org, email: "reset@exemplo.com.br" });
    const { meta } = await import("../helpers");
    await identity.requestPasswordReset({ email: user.email }, meta());
    await dispatchOutboxBatch(boss);
    await deliverQueuedEmails();
    const messages = await mailbox();
    expect(messages.map((message) => message.Subject)).toEqual(["Redefinição de senha do GCli"]);
  });
});
