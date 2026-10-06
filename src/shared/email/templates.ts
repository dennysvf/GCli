import { formatDateTime, formatLocale } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/locales";
import { createTranslator, type Translator } from "@/shared/i18n/translator";
import type { EmailMessage } from "./email-sender";

// Transactional emails in the recipient's language (ADR-028): plain HTML with inline styles, no
// images (spec F01 assumptions). Texts come from the `email` catalog; dates use the zone of the
// payload, which the worker reads from the stored outbox message.
export type EmailContext = { locale: Locale; timeZone: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(t: Translator, locale: Locale, title: string, body: string): string {
  return `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#171717">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}
<p style="font-size:12px;color:#737373;margin-top:32px">${escapeHtml(t("email.footer"))}</p>
</div></body></html>`;
}

function button(t: Translator, url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#171717;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(label)}</a></p>
<p style="font-size:12px;color:#737373;word-break:break-all">${escapeHtml(t("email.copyLink", { url }))}</p>`;
}

export function invitationEmail(
  input: { to: string; name: string; organizationName: string; url: string; expiresAt: Date },
  context: EmailContext,
): EmailMessage {
  const t = createTranslator(context.locale);
  const expires = formatDateTime(input.expiresAt, formatLocale(context.locale), context.timeZone);
  const params = { name: input.name, organization: input.organizationName, expires, url: input.url };
  const html = layout(
    t,
    context.locale,
    t("email.invitation.title"),
    `<p>${escapeHtml(t("email.invitation.greeting", params))}</p>
<p>${escapeHtml(t("email.invitation.body", params))}</p>
${button(t, input.url, t("email.invitation.button"))}
<p style="font-size:14px">${escapeHtml(t("email.invitation.validity", params))}</p>`,
  );
  const text = [
    t("email.invitation.greeting", params),
    "",
    t("email.invitation.body", params),
    t("email.invitation.link", params),
    "",
    t("email.invitation.validity", params),
  ].join("\n");
  return { to: input.to, subject: t("email.invitation.subject", params), html, text };
}

export function passwordResetEmail(
  input: { to: string; name: string; url: string },
  context: EmailContext,
): EmailMessage {
  const t = createTranslator(context.locale);
  const params = { name: input.name, url: input.url };
  const html = layout(
    t,
    context.locale,
    t("email.passwordReset.title"),
    `<p>${escapeHtml(t("email.passwordReset.greeting", params))}</p>
<p>${escapeHtml(t("email.passwordReset.body", params))}</p>
${button(t, input.url, t("email.passwordReset.button"))}
<p style="font-size:14px">${escapeHtml(t("email.passwordReset.validity", params))}</p>`,
  );
  const text = [
    t("email.passwordReset.greeting", params),
    "",
    t("email.passwordReset.body", params),
    t("email.passwordReset.link", params),
    "",
    t("email.passwordReset.validity", params),
  ].join("\n");
  return { to: input.to, subject: t("email.passwordReset.subject", params), html, text };
}
