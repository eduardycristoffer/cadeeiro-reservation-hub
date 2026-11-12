import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLE = z.enum(["super_admin", "gestor", "funcionario"]);

function code(e: unknown): string {
  const m = (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e)) || "";
  const known = ["FORBIDDEN_ROLE", "FORBIDDEN_UNIT", "UNITS_REQUIRED", "CANNOT_EDIT_SELF", "FORBIDDEN"];
  return known.find((k) => m.includes(k)) ?? m;
}

/** Convida uma pessoa: valida permissão no banco (como quem chama), cria a conta e envia o e-mail de convite. */
export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().trim().toLowerCase().email().max(254),
      fullName: z.string().trim().min(2).max(120),
      role: ROLE,
      unitIds: z.array(z.string().uuid()).max(50),
      redirectTo: z.string().url().max(300),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const check = await sb.rpc("admin_check_invite", { _role: data.role, _unit_ids: data.unitIds });
    if (check.error) return { ok: false as const, error: code(check.error) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const inv = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: data.redirectTo,
      data: { full_name: data.fullName },
    });
    if (inv.error || !inv.data.user) {
      const msg = inv.error?.message ?? "";
      return { ok: false as const, error: /already|registered|exists/i.test(msg) ? "ALREADY_EXISTS" : msg || "Falha ao enviar convite" };
    }
    const set = await sb.rpc("admin_set_user_access", {
      _user_id: inv.data.user.id, _role: data.role, _unit_ids: data.unitIds, _full_name: data.fullName, _invited: true,
    });
    if (set.error) return { ok: false as const, error: code(set.error) };
    return { ok: true as const, error: null };
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
