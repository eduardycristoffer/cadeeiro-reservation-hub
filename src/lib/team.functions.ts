import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLE = z.enum(["super_admin", "gestor", "funcionario"]);

function code(e: unknown): string {
  const m = (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e)) || "";
  const known = ["FORBIDDEN_ROLE", "FORBIDDEN_UNIT", "UNITS_REQUIRED", "CANNOT_EDIT_SELF", "FORBIDDEN"];
  return known.find((k) => m.includes(k)) ?? m;
}

/** Endereço público do painel para montar o link do convite: segredo PUBLIC_APP_URL ou o endereço desta requisição. */
async function appBase(): Promise<string> {
  const { publicOrigin } = await import("@/lib/site");
  const fixed = process.env["PUBLIC_APP_URL"]?.trim();
  if (fixed) return publicOrigin(fixed);
  const { getRequest } = await import("@tanstack/react-start/server");
  return publicOrigin(new URL(getRequest().url).origin);
}

async function inviterName(sb: { from: (t: "user_profiles") => { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => PromiseLike<{ data: { full_name?: string | null } | null }> } } } }, uid: string) {
  const { data } = await sb.from("user_profiles").select("full_name").eq("id", uid).maybeSingle();
  return data?.full_name ?? null;
}

/**
 * Convida uma pessoa: valida permissão no banco (como quem chama), cria a conta e manda o convite por e-mail.
 * Sem provedor de e-mail (ou se o envio falhar) devolve o link para o gestor copiar e mandar pelo WhatsApp.
 */
export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().trim().toLowerCase().email().max(254),
      fullName: z.string().trim().min(2).max(120),
      role: ROLE,
      unitIds: z.array(z.string().uuid()).max(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const check = await sb.rpc("admin_check_invite", { _role: data.role, _unit_ids: data.unitIds });
    if (check.error) return { ok: false as const, error: code(check.error) };

    const { createAccessLink, emailInvite } = await import("@/server/invite.server");
    const made = await createAccessLink({ email: data.email, fullName: data.fullName, base: await appBase(), mode: "new" });
    if (!made.ok) return { ok: false as const, error: made.error };

    const set = await sb.rpc("admin_set_user_access", {
      _user_id: made.userId!, _role: data.role, _unit_ids: data.unitIds, _full_name: data.fullName, _invited: true,
    });
    if (set.error) {
      // não deixa uma conta sem papel para trás
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.auth.admin.deleteUser(made.userId!).catch(() => undefined);
      return { ok: false as const, error: code(set.error) };
    }
    const sent = await emailInvite(data.email, data.fullName, made.link, await inviterName(sb as never, context.userId));
    return { ok: true as const, error: null, emailed: sent.emailed, reason: sent.reason, link: sent.emailed ? null : made.link };
  });

/** Reenvia o convite de quem ainda não criou a senha. Só vale para pessoas que o chamador pode gerenciar (a lista vem do banco). */
export const resendTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const list = await sb.rpc("admin_list_team");
    if (list.error) return { ok: false as const, error: code(list.error) };
    const person = (list.data as { id: string; email: string; full_name: string | null; is_active: boolean; needs_onboarding: boolean }[] | null)?.find((p) => p.id === data.userId);
    if (!person) return { ok: false as const, error: "FORBIDDEN" };
    if (!person.is_active) return { ok: false as const, error: "Esta pessoa está desativada. Reative antes de reenviar." };
    if (!person.needs_onboarding) return { ok: false as const, error: "Esta pessoa já criou a senha." };

    const { createAccessLink, emailInvite } = await import("@/server/invite.server");
    const made = await createAccessLink({ email: person.email, fullName: person.full_name ?? "", base: await appBase(), mode: "again" });
    if (!made.ok) return { ok: false as const, error: made.error };
    const sent = await emailInvite(person.email, person.full_name ?? "", made.link, await inviterName(sb as never, context.userId));
    return { ok: true as const, error: null, emailed: sent.emailed, reason: sent.reason, link: sent.emailed ? null : made.link };
  });

/** Desativa/reativa: a regra de quem pode vale no banco; a conta também é bloqueada no login. */
export const setTeamMemberActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc("admin_set_user_active", { _user_id: data.userId, _active: data.active });
    if (r.error) return { ok: false as const, error: code(r.error) };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ban = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: data.active ? "none" : "876000h" });
    if (ban.error) return { ok: false as const, error: "Acesso removido no painel, mas o bloqueio de login falhou. Tente de novo." };
    return { ok: true as const, error: null };
  });

/**
 * Primeiro acesso: define a senha de quem veio pelo convite. Só vale enquanto o
 * perfil ainda está marcado como "primeiro acesso" (needs_onboarding), então não
 * serve para trocar senha sem a senha atual depois.
 */
export const setFirstAccessPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: prof } = await context.supabase.from("user_profiles").select("needs_onboarding,is_active").eq("id", context.userId).maybeSingle();
    if (!prof || !prof.needs_onboarding || !prof.is_active) return { ok: false as const, error: "Este link de primeiro acesso já foi usado." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.password });
    if (r.error) return { ok: false as const, error: /weak|pwned|leaked/i.test(r.error.message) ? "Senha fraca ou já vazada na internet. Escolha outra." : r.error.message };
    return { ok: true as const, error: null };
  });

/**
 * Perdeu o celular? Quem pode gerenciar a pessoa (mesma regra de desativar/reativar) remove o 2FA dela.
 * Depois disso ela entra só com e-mail e senha e pode ligar o 2FA de novo no perfil. Fica no histórico.
 */
export const resetTeamMemberTwoFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const can = await supabaseAdmin.rpc("_can_manage_user" as never, { _uid: context.userId, _target: data.userId } as never);
    if (can.error || can.data !== true) return { ok: false as const, error: "FORBIDDEN" };
    const list = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: data.userId });
    if (list.error) return { ok: false as const, error: "Não foi possível consultar o 2FA agora. Tente de novo." };
    const factors = list.data?.factors ?? [];
    for (const f of factors) {
      const del = await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: f.id, userId: data.userId });
      if (del.error) return { ok: false as const, error: "Não foi possível remover o 2FA agora. Tente de novo." };
    }
    if (factors.length > 0) {
      const { data: me } = await supabaseAdmin.from("user_profiles").select("full_name").eq("id", context.userId).maybeSingle();
      await supabaseAdmin.from("audit_log" as never).insert({
        source: "painel", action: "usuario.2fa_removido", entity_type: "usuario", entity_id: data.userId, actor_user_id: context.userId,
        actor_name: me?.full_name ?? null, note: "2FA removido por quem gerencia o acesso",
      } as never);
    }
    return { ok: true as const, error: null, removed: factors.length };
  });
