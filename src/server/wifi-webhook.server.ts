// Recebe o webhook do sistema de Wi-Fi: /api/public/hooks/<token>. O token só existe na URL; no banco fica o hash.
import { sha256Hex } from "@/lib/integration/crypto";
import { byteLength, HOOK_MAX_BYTES, HOOK_TOKEN_RE, parseHookBody, queryToPayload } from "@/lib/webhook-body";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function handleWifiHook(request: Request, token: string): Promise<Response> {
  // formato errado nem chega no banco; a resposta é a mesma de um endereço que não existe
  if (!HOOK_TOKEN_RE.test(token)) return json(404, { ok: false, error: "NOT_FOUND" });

  let payload: unknown;
  if (request.method === "GET") {
    payload = queryToPayload(new URL(request.url));
  } else {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > HOOK_MAX_BYTES) return json(413, { ok: false, error: "PAYLOAD_TOO_LARGE" });
    const text = await request.text().catch(() => "");
    if (byteLength(text) > HOOK_MAX_BYTES) return json(413, { ok: false, error: "PAYLOAD_TOO_LARGE" });
    payload = parseHookBody(request.headers.get("content-type"), text);
    if (payload === undefined) return json(400, { ok: false, error: "INVALID_BODY" });
  }

  const { data, error } = await (supabaseAdmin as unknown as { rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> })
    .rpc("webhook_ingest", { _token_hash: await sha256Hex(token), _payload: payload });
  if (error) return json(500, { ok: false, error: "INTERNAL" });
  const r = (data ?? {}) as { ok?: boolean; error?: string; status?: string };
  if (r.ok) return json(200, { ok: true, status: r.status ?? "processado" });
  if (r.error === "RATE_LIMITED") return json(429, { ok: false, error: "RATE_LIMITED" });
  return json(404, { ok: false, error: "NOT_FOUND" });
}
