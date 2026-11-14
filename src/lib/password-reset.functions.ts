import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Endereço público do painel: segredo PUBLIC_APP_URL ou o endereço desta requisição. */
async function appBase(): Promise<string> {
  const fixed = process.env["PUBLIC_APP_URL"]?.trim();
  if (fixed) return new URL(fixed).origin;
  const { getRequest } = await import("@tanstack/react-start/server");
  return new URL(getRequest().url).origin;
}

/**
 * "Esqueci minha senha". Público (quem pede não tem sessão), então:
 *  - a resposta é sempre a mesma, exista a conta ou não (não revela quem tem acesso);
 *  - só gera link para conta ativa e com papel no painel;
 *  - no máximo 3 pedidos por conta a cada 15 minutos;
 *  - cada pedido fica no histórico.
 * O link vai pelo Resend, apontando para o próprio painel (leitores de e-mail não gastam o token).
 * Sem Resend configurado, cai no envio padrão do Supabase.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(d))
  .handler(async ({ data }) => {
    const done = { ok: true as const };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: id } = await supabaseAdmin.rpc("auth_user_id_by_email" as never, { _email: data.email } as never);
      if (!id) return done;
      const uid = id as string;
      const { data: prof } = await supabaseAdmin.from("user_profiles").select("is_active,full_name").eq("id", uid).maybeSingle();
      if (!prof || !prof.is_active) return done;
      const { count: roles } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("user_id", uid);
      if (!roles) return done;
      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      const { count } = await supabaseAdmin.from("audit_log" as never).select("id", { count: "exact", head: true })
        .eq("action", "usuario.senha_redefinicao_pedida").eq("entity_id", uid).gte("created_at", since);
      if ((count ?? 0) >= 3) return done;
      await supabaseAdmin.from("audit_log" as never).insert({
        source: "painel", action: "usuario.senha_redefinicao_pedida", entity_type: "usuario", entity_id: uid, actor_user_id: uid,
        actor_name: prof.full_name, note: "Pedido de redefinição de senha",
      } as never);

      const base = await appBase();
      const { buildInviteLink } = await import("@/lib/invite-link");
      const { emailConfig, sendEmail } = await import("@/server/email.server");
      const { renderResetEmail } = await import("@/lib/email");
      const cfg = emailConfig();
      if (cfg) {
        const res = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email: data.email, options: { redirectTo: `${base}/redefinir-senha` } });
        const p = res.data?.properties;
        const link = p ? buildInviteLink(base, p.hashed_token, p.verification_type, "/redefinir-senha") : null;
        if (link) {
          const sent = await sendEmail(cfg, data.email, renderResetEmail({ name: prof.full_name ?? "", link }));
          if (sent.ok) return done;
        }
      }
      await supabaseAdmin.auth.resetPasswordForEmail(data.email, { redirectTo: `${base}/redefinir-senha` });
    } catch { /* a resposta não pode revelar nada */ }
    return done;
  });
