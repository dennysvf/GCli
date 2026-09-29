import type { EmailMessage } from "./email-sender";

// pt-BR transactional emails: plain HTML with inline styles, no images (spec F01 assumptions).
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#171717">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}
<p style="font-size:12px;color:#737373;margin-top:32px">Se você não esperava este e-mail, ignore-o.</p>
</div></body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#171717;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(label)}</a></p>
<p style="font-size:12px;color:#737373;word-break:break-all">Ou copie e cole no navegador: ${escapeHtml(url)}</p>`;
}

export function invitationEmail(input: {
  to: string;
  name: string;
  organizationName: string;
  url: string;
  expiresAt: Date;
}): EmailMessage {
  const expires = input.expiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const subject = `Convite para acessar o GCli — ${input.organizationName}`;
  const html = layout(
    "Você foi convidado para o GCli",
    `<p>Olá, ${escapeHtml(input.name)}.</p>
<p>Você foi convidado para acessar o sistema da <strong>${escapeHtml(input.organizationName)}</strong>. Defina sua senha para começar.</p>
${button(input.url, "Definir senha e entrar")}
<p style="font-size:14px">Este link é válido até ${escapeHtml(expires)} e só pode ser usado uma vez.</p>`,
  );
  const text = `Olá, ${input.name}.\n\nVocê foi convidado para acessar o sistema da ${input.organizationName}.\nDefina sua senha em: ${input.url}\n\nO link é válido até ${expires} e só pode ser usado uma vez.`;
  return { to: input.to, subject, html, text };
}

export function passwordResetEmail(input: { to: string; name: string; url: string }): EmailMessage {
  const subject = "Redefinição de senha do GCli";
  const html = layout(
    "Redefinir sua senha",
    `<p>Olá, ${escapeHtml(input.name)}.</p>
<p>Recebemos um pedido para redefinir a senha da sua conta.</p>
${button(input.url, "Redefinir senha")}
<p style="font-size:14px">Este link é válido por 60 minutos e só pode ser usado uma vez.</p>`,
  );
  const text = `Olá, ${input.name}.\n\nRecebemos um pedido para redefinir a senha da sua conta.\nRedefina em: ${input.url}\n\nO link é válido por 60 minutos e só pode ser usado uma vez.`;
  return { to: input.to, subject, html, text };
}
