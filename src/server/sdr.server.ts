// Infra comum da API do SDR. Só roda no servidor (carregado com import dinâmico nas rotas).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { API_ERRORS, ApiError, codeFromDbError, errorBody } from "@/lib/integration/errors";
import { sha256Hex } from "@/lib/integration/crypto";
import { decideIdempotency, IDEMPOTENCY_KEY_RE, type IdemRecord } from "@/lib/integration/idempotency";
import { maskPhone } from "@/lib/integration/phone";
import { authorizeSdrScope } from "./sdr-scope.server";

export const db = () => supabaseAdmin as unknown as SupabaseClient;

export type ApiKeyCtx = { id: string; organization_id: string; prefix: string; scopes: string[]; unit_ids: string[] };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new ApiError(codeFromDbError(error));
  return data as T;
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try { raw = await request.json(); } catch { throw new ApiError("VALIDATION_ERROR", "O corpo da requisição precisa ser JSON válido."); }
  return parseWith(schema, raw);
}

export function parseWith<T>(schema: ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new ApiError("VALIDATION_ERROR", `Campo inválido: ${first?.path.join(".") || "corpo"} (${first?.message ?? "formato"}).`);
  }
  return r.data;
}

/** Remove dados pessoais antes de logar. */
function scrub(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (/phone|telefone/i.test(k)) out[k] = typeof val === "string" ? maskPhone(val) : null;
      else if (/name|nome|description|notes|reason|summary|subject/i.test(k)) out[k] = val ? "[omitido]" : val;
      else out[k] = scrub(val);
    }
    return out;
  }
  return v;
}

async function logCall(entry: { orgId?: string | null; endpoint: string; status: number; request: unknown; response: unknown; error?: string | null }) {
  try {
    await db().from("integration_event_logs").insert({
      organization_id: entry.orgId ?? null, provider: "sdr", direction: "inbound", endpoint: entry.endpoint,
      status_code: entry.status, request: scrub(entry.request), response: scrub(entry.response), error: entry.error ?? null,
    });
  } catch { /* log nunca derruba a resposta */ }
}

async function authenticate(request: Request, scope: "read" | "write"): Promise<ApiKeyCtx> {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!m?.[1] || m[1].length > 200) throw new ApiError("UNAUTHORIZED");
  const hash = await sha256Hex(m[1]);
  const { data, error } = await db().rpc("sdr_auth", { _key_hash: hash });
  if (error || !data) throw new ApiError("UNAUTHORIZED");
  const k = data as ApiKeyCtx & { rate_limited: boolean };
  if (k.rate_limited) throw new ApiError("RATE_LIMITED");
  if (!k.scopes.includes(scope)) throw new ApiError("FORBIDDEN_SCOPE");
  return { ...k, unit_ids: k.unit_ids ?? [] };
}

/**
 * Envelope de cada endpoint: autentica, aplica idempotência (quando há Idempotency-Key e idempotent=true),
 * executa, padroniza erro e registra em integration_event_logs.
 */
export async function handleSdr(
  request: Request,
  opts: { endpoint: string; scope: "read" | "write"; idempotent?: boolean },
  fn: (ctx: { key: ApiKeyCtx; body: unknown; url: URL }) => Promise<{ status?: number | undefined; data: unknown; mensagem_sugerida?: string | undefined }>,
): Promise<Response> {
  const url = new URL(request.url);
  let key: ApiKeyCtx | null = null;
  let body: unknown = undefined;
  let idemRowKey: string | null = null;
  try {
    key = await authenticate(request, opts.scope);
    if (request.method !== "GET") {
      const text = await request.text();
      try { body = text ? JSON.parse(text) : {}; } catch { throw new ApiError("VALIDATION_ERROR", "O corpo da requisição precisa ser JSON válido."); }
    }

    const scopeBody = opts.endpoint === "/reservations/{protocol}" && body && typeof body === "object"
      ? { ...body, protocol: url.pathname.split("/").at(-1) } : body;
    await authorizeSdrScope(db(), key, opts.endpoint, request.method, scopeBody);
    const idem = request.headers.get("idempotency-key");
    if (opts.idempotent && idem) {
      if (!IDEMPOTENCY_KEY_RE.test(idem)) throw new ApiError("VALIDATION_ERROR", "Idempotency-Key inválida (8 a 128 caracteres: letras, números, - _ : .).");
      const reqHash = await sha256Hex(`${request.method} ${url.pathname} ${JSON.stringify(body ?? {})}`);
      await db().from("api_idempotency").delete().eq("api_key_id", key.id).eq("idem_key", idem).lt("expires_at", new Date().toISOString());
      const { data: existing } = await db().from("api_idempotency").select("request_hash,status_code,response,expires_at")
        .eq("api_key_id", key.id).eq("idem_key", idem).maybeSingle();
      const d = decideIdempotency(existing as IdemRecord | null, reqHash);
      if (d.action === "replay") return json(d.status, d.body);
      if (d.action === "conflict") throw new ApiError("IDEMPOTENCY_CONFLICT");
      if (d.action === "in_progress") throw new ApiError("IDEMPOTENCY_IN_PROGRESS");
      const { error } = await db().from("api_idempotency").insert({ api_key_id: key.id, idem_key: idem, request_hash: reqHash });
      if (error) throw new ApiError("IDEMPOTENCY_IN_PROGRESS");
      idemRowKey = idem;
    }

    const r = await fn({ key, body, url });
    const status = r.status ?? 200;
    const out = { ok: true, data: r.data, ...(r.mensagem_sugerida ? { mensagem_sugerida: r.mensagem_sugerida } : {}) };
    if (idemRowKey) await db().from("api_idempotency").update({ status_code: status, response: out }).eq("api_key_id", key.id).eq("idem_key", idemRowKey);
    await logCall({ orgId: key.organization_id, endpoint: `${request.method} ${opts.endpoint}`, status,
      request: { query: Object.fromEntries(url.searchParams), body, key_prefix: key.prefix }, response: { ok: true } });
    return json(status, out);
  } catch (e) {
    const code = e instanceof ApiError ? e.code : "INTERNAL_ERROR";
    if (!(e instanceof ApiError)) console.error("[sdr]", opts.endpoint, e);
    const status = API_ERRORS[code]?.status ?? 500;
    const out = errorBody(code, e instanceof ApiError ? e.message : undefined);
    // erros de negócio ficam gravados (replay); erros 5xx liberam a chave para nova tentativa
    if (idemRowKey && key) {
      if (status < 500) await db().from("api_idempotency").update({ status_code: status, response: out }).eq("api_key_id", key.id).eq("idem_key", idemRowKey);
      else await db().from("api_idempotency").delete().eq("api_key_id", key.id).eq("idem_key", idemRowKey);
    }
    await logCall({ orgId: key?.organization_id ?? null, endpoint: `${request.method} ${opts.endpoint}`, status,
      request: { query: Object.fromEntries(url.searchParams), body, key_prefix: key?.prefix ?? null }, response: { ok: false, code },
      error: code });
    return json(status, out);
  }
}

export function notFoundJson() {
  return json(404, errorBody("NOT_FOUND"));
}
