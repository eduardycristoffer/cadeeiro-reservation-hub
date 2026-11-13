import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Diz ao painel se o envio de e-mail está configurado (sem expor nenhum segredo). Só gestores e super admins. */
export const getEmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("notification_settings_get" as never);
    if (error) return { ok: false as const, error: "FORBIDDEN" };
    void data;
    const { emailMissing } = await import("@/server/email.server");
    const missing = emailMissing();
    return { ok: true as const, configured: missing.length === 0, missing, appUrl: Boolean(process.env["PUBLIC_APP_URL"]?.trim()) };
  });
