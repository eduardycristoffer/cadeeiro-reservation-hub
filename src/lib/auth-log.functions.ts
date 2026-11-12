import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Registra tentativa de login bloqueada (conta desativada). Público por natureza
 * (quem tenta não tem sessão): só grava se o e-mail for de um usuário realmente
 * desativado, e nunca devolve se a conta existe.
 */
export const logBlockedLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id } = await supabaseAdmin.rpc("auth_user_id_by_email" as never, { _email: data.email } as never);
    if (!id) return { ok: true };
    const { data: prof } = await supabaseAdmin.from("user_profiles").select("is_active,full_name").eq("id", id as string).maybeSingle();
    if (!prof || prof.is_active) return { ok: true };
    // evita encher o histórico: no máximo 1 registro por usuário a cada 5 minutos
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const { count } = await supabaseAdmin.from("audit_log" as never).select("id", { count: "exact", head: true })
      .eq("action", "login.bloqueado").eq("entity_id", id as string).gte("created_at", since);
    if (count) return { ok: true };
    await supabaseAdmin.from("audit_log" as never).insert({
      source: "painel", action: "login.bloqueado", entity_type: "usuario", entity_id: id, actor_user_id: id,
      actor_name: prof.full_name, note: "Usuário desativado tentou entrar",
    } as never);
    return { ok: true };
  });
