// Envio de e-mail pelo Resend (https://resend.com). Só roda no servidor.
// Segredos (nunca no banco): RESEND_API_KEY e EMAIL_FROM (ex.: "Candeeiro <alertas@seudominio.com.br>", domínio verificado no Resend).
import type { Mail } from "@/lib/email";

export type EmailConfig = { apiKey: string; from: string };

export function emailConfig(): EmailConfig | null {
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  const from = process.env["EMAIL_FROM"]?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

/** O que falta configurar, em português, para a tela mostrar. */
export function emailMissing(): string[] {
  return [...(process.env["RESEND_API_KEY"]?.trim() ? [] : ["RESEND_API_KEY"]), ...(process.env["EMAIL_FROM"]?.trim() ? [] : ["EMAIL_FROM"])];
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

export async function sendEmail(cfg: EmailConfig, to: string, mail: Mail): Promise<SendResult> {
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
