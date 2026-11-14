// Envio de e-mail pelo Resend (https://resend.com). Só roda no servidor.
// Segredos (nunca no banco): RESEND_API_KEY e EMAIL_FROM (ex.: "Candeeiro <alertas@seudominio.com.br>", domínio verificado no Resend).
import type { Mail } from "@/lib/email";

// Provedor 1 (padrão): e-mail gerenciado do Lovable, no domínio notify.candeeiro.tryade.com.br (usa LOVABLE_API_KEY).
// Provedor 2 (opcional): Resend, se RESEND_API_KEY e EMAIL_FROM estiverem cadastrados.
const SENDER_DOMAIN = "notify.candeeiro.tryade.com.br";
const FROM_NAME = "Rede Candeeiro";

export type EmailConfig =
  | { provider: "lovable"; apiKey: string; sendUrl: string | undefined }
  | { provider: "resend"; apiKey: string; from: string };

export function emailConfig(): EmailConfig | null {
  const lovable = process.env["LOVABLE_API_KEY"]?.trim();
  if (lovable) return { provider: "lovable", apiKey: lovable, sendUrl: process.env["LOVABLE_SEND_URL"]?.trim() || undefined };
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  const from = process.env["EMAIL_FROM"]?.trim();
  return apiKey && from ? { provider: "resend", apiKey, from } : null;
}

/** O que falta configurar, em português, para a tela mostrar. Vazio quando algum provedor está pronto. */
export function emailMissing(): string[] {
  return emailConfig() ? [] : ["LOVABLE_API_KEY"];
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

async function sendViaLovable(cfg: Extract<EmailConfig, { provider: "lovable" }>, to: string, mail: Mail, key?: string): Promise<SendResult> {
  try {
    const { EmailAPIError, sendLovableEmail } = await import("@lovable.dev/email-js");
    try {
      await sendLovableEmail(
        { to, from: { name: FROM_NAME, address: `noreply@${SENDER_DOMAIN}` }, sender_domain: SENDER_DOMAIN, subject: mail.subject, html: mail.html, text: mail.text,
          purpose: "transactional", label: "painel", idempotency_key: key ?? crypto.randomUUID() },
        { apiKey: cfg.apiKey, sendUrl: cfg.sendUrl },
      );
      return { ok: true, id: null };
    } catch (e) {
      if (e instanceof EmailAPIError && e.code === "recipient_suppressed") return { ok: false, error: "Destinatário bloqueado para receber e-mail (descadastrado ou com retorno de erro)" };
      throw e;
    }
  } catch (e) {
    return { ok: false, error: `E-mail: ${e instanceof Error ? e.message : "falha no envio"}`.slice(0, 280) };
  }
}

export async function sendEmail(cfg: EmailConfig, to: string, mail: Mail, key?: string): Promise<SendResult> {
  if (cfg.provider === "lovable") return sendViaLovable(cfg, to, mail, key);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: cfg.from, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: ctl.signal,
    });
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
    if (res.ok) return { ok: true, id: body?.id ?? null };
    return { ok: false, error: `Resend ${res.status}: ${body?.message ?? body?.name ?? "erro"}`.slice(0, 280) };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "AbortError" ? "Resend: tempo esgotado" : "Resend: sem conexão" };
  } finally {
    clearTimeout(timer);
  }
}
