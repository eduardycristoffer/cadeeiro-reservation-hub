// Gera o link de primeiro acesso (sem mandar e-mail do Supabase) e envia pelo e-mail da Rede Candeeiro quando disponível.
import { buildInviteLink } from "@/lib/invite-link";
import { renderInviteEmail } from "@/lib/email";
import { emailConfig, sendEmail } from "./email.server";

export type AccessLink = { ok: true; link: string } | { ok: false; error: string };

/**
 * `mode: "new"` cria a conta convidada. `mode: "again"` reenvia para quem já tem conta mas ainda não criou a senha:
 * tenta o convite de novo e, se a conta já estiver confirmada, usa um link de entrada.
 */
export async function createAccessLink(opts: { email: string; fullName: string; base: string; mode: "new" | "again" }): Promise<AccessLink & { userId?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const redirectTo = `${opts.base}/primeiro-acesso`;
  let res = await supabaseAdmin.auth.admin.generateLink({ type: "invite", email: opts.email, options: { redirectTo, data: { full_name: opts.fullName } } });
  if (res.error && opts.mode === "again" && /already|registered|exists|confirmed/i.test(res.error.message)) {
    res = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: opts.email, options: { redirectTo } });
  }
  if (res.error || !res.data?.properties) {
    const msg = res.error?.message ?? "";
    return { ok: false, error: /already|registered|exists/i.test(msg) ? "ALREADY_EXISTS" : msg || "Falha ao gerar o link de acesso" };
  }
  const { hashed_token, verification_type, action_link } = res.data.properties;
  const link = buildInviteLink(opts.base, hashed_token, verification_type) ?? action_link;
  return { ok: true, link, userId: res.data.user.id };
}

/** Envia o convite por e-mail. `emailed:false` quando não há provedor configurado ou o envio falhou (o gestor copia o link). */
export async function emailInvite(to: string, name: string, link: string, inviter: string | null): Promise<{ emailed: boolean; reason: string | null }> {
  const cfg = emailConfig();
  if (!cfg) return { emailed: false, reason: "sem_provedor" };
  const r = await sendEmail(cfg, to, renderInviteEmail({ name, link, inviter }));
  return r.ok ? { emailed: true, reason: null } : { emailed: false, reason: r.error };
}
