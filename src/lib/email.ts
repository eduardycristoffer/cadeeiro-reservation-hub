// E-mails do painel: montagem do conteúdo (texto + HTML) e validações. Sem acesso a rede nem a segredos,
// então roda no servidor, no navegador e nos testes.

export const BRAND = "Rede Candeeiro";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const isValidEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());

/** "a@x.com, B@x.com; c@x.com" -> lista sem repetidos, minúscula; o que não é e-mail vai para `invalid`. */
export function parseEmailList(text: string): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const v = raw.trim().toLowerCase();
    if (!v) continue;
    if (!isValidEmail(v)) { if (!invalid.includes(v)) invalid.push(v); continue; }
    if (!emails.includes(v)) emails.push(v);
  }
  return { emails, invalid };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Assunto numa linha só (sem quebras que possam virar cabeçalhos). */
export const oneLine = (s: string, max = 200) => s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);

/** Endereço completo de uma página do painel. Só aceita https (ou http em localhost) e caminhos /admin. */
export function panelUrl(base: string | null | undefined, path: string | null | undefined): string | null {
  if (!base || !path || !/^\/admin(\/[a-z0-9-]+)?$/.test(path)) return null;
  try {
    const u = new URL(base);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    return `${u.origin}${path}`;
  } catch { return null; }
}

export type Mail = { subject: string; text: string; html: string };

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function shell(title: string, bodyHtml: string, button: { label: string; url: string } | null): string {
  const btn = button
    ? `<p style="margin:28px 0 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#1d1d1f;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;line-height:1;padding:16px 26px;border-radius:14px">${escapeHtml(button.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f5f5f7;font-family:${FONT};color:#1d1d1f">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:22px">
<tr><td style="padding:32px 28px">
<p style="margin:0 0 18px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#6e6e73">${BRAND}</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:700">${escapeHtml(title)}</h1>
${bodyHtml}${btn}
</td></tr></table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#86868b">Você recebe este e-mail por fazer parte da equipe no painel ${BRAND}.</p>
</td></tr></table></body></html>`;
}

const paragraphs = (text: string) => text.split("\n").filter((l) => l.trim()).map((l) => `<p style="margin:0 0 10px;font-size:16px;line-height:1.5">${escapeHtml(l)}</p>`).join("");

/** Alerta do painel: assunto, texto simples e HTML com botão "Abrir no painel". */
export function renderAlertEmail(a: { subject: string; body: string; url: string | null }): Mail {
  const subject = oneLine(a.subject);
  const title = subject.replace(/^\[[^\]]*\]\s*/, "") || subject;
  const body = a.body.replace(/ · /g, "\n").trim();
  const text = [title, "", body, ...(a.url ? ["", `Abrir no painel: ${a.url}`] : []), "", `— ${BRAND}`].join("\n");
  return { subject, text, html: shell(title, paragraphs(body), a.url ? { label: "Abrir no painel", url: a.url } : null) };
}

/** Convite para a equipe. `link` é o endereço único para criar a senha. */
export function renderInviteEmail(i: { name: string; link: string; inviter?: string | null }): Mail {
  const first = oneLine(i.name).split(" ")[0] || "";
  const who = i.inviter ? `${oneLine(i.inviter, 80)} convidou você` : "Você foi convidado(a)";
  const intro = `${first ? `Olá, ${first}! ` : ""}${who} para o painel de gestão da ${BRAND}.`;
  const rule = "Toque no botão para criar sua senha. O link vale por tempo limitado e só pode ser usado uma vez.";
  const text = [intro, "", rule, "", i.link, "", `— ${BRAND}`].join("\n");
  return {
    subject: `Seu acesso ao painel ${BRAND}`,
    text,
    html: shell("Seu acesso ao painel", `<p style="margin:0 0 10px;font-size:16px;line-height:1.5">${escapeHtml(intro)}</p><p style="margin:0;font-size:15px;line-height:1.5;color:#6e6e73">${escapeHtml(rule)}</p>`, { label: "Criar minha senha", url: i.link }),
  };
}

/** Redefinição de senha. `link` é de uso único e vale por tempo limitado. */
export function renderResetEmail(i: { name: string; link: string }): Mail {
  const first = oneLine(i.name).split(" ")[0] || "";
  const intro = `${first ? `Olá, ${first}! ` : ""}Recebemos um pedido para redefinir a senha do seu acesso ao painel da ${BRAND}.`;
  const rule = "Toque no botão para criar uma senha nova. O link vale por tempo limitado e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.";
  const text = [intro, "", rule, "", i.link, "", `— ${BRAND}`].join("\n");
  return {
    subject: `Redefinir sua senha — ${BRAND}`,
    text,
    html: shell("Redefinir senha", `<p style="margin:0 0 10px;font-size:16px;line-height:1.5">${escapeHtml(intro)}</p><p style="margin:0;font-size:15px;line-height:1.5;color:#6e6e73">${escapeHtml(rule)}</p>`, { label: "Criar senha nova", url: i.link }),
  };
}

export const ALERT_KINDS = [
  { id: "reserva_pendente", label: "Reserva nova para aprovar", hint: "Cliente reservou pelo site ou WhatsApp." },
  { id: "grupo_grande", label: "Grupo grande", hint: "Só admins — precisa de aprovação de um admin." },
  { id: "reserva_cancelada", label: "Cancelamento do cliente", hint: "Com o motivo que o cliente deu." },
  { id: "sac_novo", label: "Novo atendimento no SAC", hint: "Reclamação, dúvida ou cliente pediu atendente." },
  { id: "lead_whatsapp", label: "Lead no WhatsApp", hint: "Alguém chamou pelo botão do site. Costuma ser frequente." },
  { id: "falha_envio", label: "Mensagem que não saiu", hint: "Só admins — confirmação ou CRM que falhou." },
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number]["id"];

export const SEVERITY_LABEL: Record<string, string> = { info: "Aviso", atencao: "Atenção", urgente: "Urgente" };
