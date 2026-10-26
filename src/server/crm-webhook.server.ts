import { db } from "./sdr.server";
import { safeEqual, sha256Hex, verifyChatwootSignature } from "@/lib/integration/crypto";
import { buildInboundEventId, normalizeChatwootPayload, SUPPORTED_EVENTS, type SupportedEvent } from "@/lib/integration/chatwoot-events";

const ok = (body: Record<string, unknown>) => Response.json({ ok: true, ...body });
const unauthorized = () => new Response("Unauthorized", { status: 401 });

async function log(status: number, event: string | null, result: string, error?: string) {
  try {
    await db().from("integration_event_logs").insert({
      provider: "tryade_crm", direction: "inbound", endpoint: "POST /api/public/crm/webhook", status_code: status,
      request: { event }, response: { result }, error: error ?? null,
    });
  } catch { /* nunca derruba a resposta */ }
}

export async function handleCrmWebhook(request: Request, token: string): Promise<Response> {
  if (!token || token.length > 200) return unauthorized();
  const { data: s } = await db().from("integration_settings")
    .select("is_enabled,config").eq("provider", "tryade_crm").order("created_at").limit(1).maybeSingle();
  const expected = (s?.config as { webhook_token_hash?: string } | null)?.webhook_token_hash;
  if (!expected || !safeEqual(await sha256Hex(token), expected)) return unauthorized();

  const raw = await request.text();
  if (raw.length > 512_000) return new Response("Payload too large", { status: 413 });

  const hmacSecret = process.env["TRYADE_CRM_WEBHOOK_HMAC_SECRET"];
  if (hmacSecret) {
    const valid = await verifyChatwootSignature({
      secret: hmacSecret, rawBody: raw,
      signature: request.headers.get("x-chatwoot-signature"), timestamp: request.headers.get("x-chatwoot-timestamp"),
    });
    if (!valid) { await log(401, null, "invalid_signature"); return unauthorized(); }
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { return new Response("Bad Request", { status: 400 }); }
  const event = String(payload["event"] ?? "");

  if (!s?.is_enabled) { await log(200, event, "ignored_disabled"); return ok({ status: "ignored", reason: "integration_disabled" }); }
  if (!(SUPPORTED_EVENTS as readonly string[]).includes(event)) return ok({ status: "ignored", reason: "unsupported_event" });

  const eventId = buildInboundEventId(event, payload, request.headers.get("x-chatwoot-timestamp"));
  const normalized = normalizeChatwootPayload(event as SupportedEvent, payload);
  const { data, error } = await db().rpc("crm_ingest_event", { _event_id: eventId, _event_type: event, _payload: normalized });
  const result = error ? "failed" : String(data);
  await log(200, event, result, error?.message);
  // Chatwoot sempre recebe 200 para não reenviar em loop; falhas ficam na fila para análise.
  return ok({ status: result === "duplicate" ? "duplicate" : result, event_id: eventId });
}
