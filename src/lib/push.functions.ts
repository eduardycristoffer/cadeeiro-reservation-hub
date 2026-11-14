import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Chave pública para o navegador criar a assinatura de alertas. `null` = o servidor ainda não consegue enviar popups. */
export const getPushConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { pushPublicKey } = await import("@/server/push.server");
    return { publicKey: await pushPublicKey() };
  });

/**
 * Popup de teste para a própria pessoa: o banco enfileira (com limite de frequência) e o servidor já envia na hora,
 * sem esperar a rodada de 1 minuto.
 */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("push_test" as never);
    if (error) {
      const m = String(error.message ?? "");
      const code = ["NO_DEVICE", "TOO_FAST", "FORBIDDEN"].find((k) => m.includes(k));
      return { ok: false as const, error: code ?? (/could not find the function|schema cache/i.test(m) ? "NOT_READY" : "ERROR") };
    }
    const { getRequest } = await import("@tanstack/react-start/server");
    const { runPushWorker } = await import("@/server/push.server");
    const run = await runPushWorker(new URL(getRequest().url).origin);
    if ("skipped" in run) return { ok: false as const, error: "SERVER_NOT_READY" };
    return { ok: true as const, delivered: run.devices, failed: run.failed };
  });
