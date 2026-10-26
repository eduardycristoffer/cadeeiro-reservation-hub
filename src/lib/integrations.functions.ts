import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(context: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> }; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
  if (data !== true) throw new Error("FORBIDDEN");
}

/** Diz quais secrets existem no servidor (nunca devolve o valor). */
export const getCrmRuntimeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context as never);
    return {
      hasApiToken: Boolean(process.env["TRYADE_CRM_API_TOKEN"]),
      hasHmacSecret: Boolean(process.env["TRYADE_CRM_WEBHOOK_HMAC_SECRET"]),
    };
  });

/** Testa a conexão listando as caixas de entrada da conta no Chatwoot. */
export const testCrmConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context as never);
    const { loadCrmConfig } = await import("@/server/crm-worker.server");
    const { cw } = await import("@/server/chatwoot.server");
    const { cfg, missing } = await loadCrmConfig();
    if (!cfg) return { ok: false as const, error: `Pendente: ${missing.join(", ")}`, inboxes: [] };
    try {
      const r = await cw<{ payload?: { id: number; name: string; channel_type?: string }[] }>(cfg, "GET", "/inboxes");
      return { ok: true as const, error: null, inboxes: (r.payload ?? []).map((i) => ({ id: String(i.id), name: i.name, channel: i.channel_type ?? "" })) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e), inboxes: [] };
    }
  });
