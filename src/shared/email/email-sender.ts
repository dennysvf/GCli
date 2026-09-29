import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "@/shared/config/env";

// Email port and its SMTP adapter (spec F01 section 3): Mailpit locally, any SMTP provider in
// production. Emails are sent only by the worker, from outbox messages.
export type EmailMessage = { to: string; subject: string; html: string; text: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage) {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

export function createSmtpEmailSender(): EmailSender {
  const env = getEnv();
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } : undefined,
  });
  return new SmtpEmailSender(transporter, env.SMTP_FROM);
}
