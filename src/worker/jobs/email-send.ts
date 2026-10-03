import { db } from "@/shared/db/client";
import type { EmailSender } from "@/shared/email/email-sender";
import { invitationEmail, passwordResetEmail } from "@/shared/email/templates";
import { isLocale, DEFAULT_LOCALE } from "@/shared/i18n/locales";
import type { EmailJobData } from "@/shared/jobs/queues";

// Renders and sends one outbox email, then removes the token-bearing link from the stored
// payload (spec F01 section 3). Throwing lets pg-boss retry with backoff.
function render(data: EmailJobData) {
  const p = data.payload as Record<string, string>;
  // The recipient's language and the organization's zone travel in the payload (ADR-028).
  const context = {
    locale: isLocale(p.locale) ? p.locale : DEFAULT_LOCALE,
    timeZone: p.timeZone ?? "America/Sao_Paulo",
  };
  switch (data.type) {
    case "email.invitation":
      return invitationEmail(
        {
          to: p.to ?? "",
          name: p.name ?? "",
          organizationName: p.organizationName ?? "",
          url: p.url ?? "",
          expiresAt: new Date(p.expiresAt ?? Date.now()),
        },
        context,
      );
    case "email.password-reset":
      return passwordResetEmail({ to: p.to ?? "", name: p.name ?? "", url: p.url ?? "" }, context);
    default:
      throw new Error(`Unknown email type ${data.type}`);
  }
}

export async function sendOutboxEmail(data: EmailJobData, sender: EmailSender): Promise<void> {
  const message = await db().outboxMessage.findUnique({ where: { id: data.outboxId } });
  // Already delivered by an earlier attempt: never send twice.
  if (!message || (message.payload as { redacted?: boolean }).redacted) return;
  await sender.send(render(data));
  await db().outboxMessage.update({
    where: { id: data.outboxId },
    data: { payload: { redacted: true, type: data.type } },
  });
}
