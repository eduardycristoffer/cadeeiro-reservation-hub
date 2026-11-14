// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: rpcMock } }));

import { handleWifiHook } from "@/server/wifi-webhook.server";
import { sha256Hex } from "@/lib/integration/crypto";
import { byteLength, parseHookBody, queryToPayload } from "@/lib/webhook-body";

const TOKEN = `whk_${"a1b2c3d4e5".repeat(4)}`;
const req = (body: string | null, init: RequestInit & { url?: string } = {}) =>
  new Request(init.url ?? `https://painel.exemplo.com/api/public/hooks/${TOKEN}`, { method: "POST", ...init, ...(body === null ? {} : { body }) });

beforeEach(() => { rpcMock.mockReset(); rpcMock.mockResolvedValue({ data: { ok: true, status: "processado" }, error: null }); });

describe("parseHookBody", () => {
  it("lê JSON, formulário e corpo vazio", () => {
    expect(parseHookBody("application/json", '{"phone":"62999990001"}')).toEqual({ phone: "62999990001" });
    expect(parseHookBody("application/x-www-form-urlencoded", "phone=62999990001&name=Jo%C3%A3o")).toEqual({ phone: "62999990001", name: "João" });
    expect(parseHookBody(null, "")).toEqual({});
  });
  it("adivinha formulário quando o sistema esquece o tipo", () => {
    expect(parseHookBody("text/plain", "phone=1&mac=aa")).toEqual({ phone: "1", mac: "aa" });
    expect(parseHookBody("text/plain", '{"a":1}')).toEqual({ a: 1 });
  });
  it("devolve undefined para lixo", () => {
    expect(parseHookBody("application/json", "{nao e json")).toBeUndefined();
  });
  it("queryToPayload e byteLength", () => {
    expect(queryToPayload(new URL("https://x.com/h?phone=1&name=Ana"))).toEqual({ phone: "1", name: "Ana" });
    expect(byteLength("ã")).toBe(2);
  });
});

describe("handleWifiHook", () => {
  it("entrega ao banco só o hash do token e o corpo", async () => {
    const r = await handleWifiHook(req('{"phone":"62999990001"}', { headers: { "content-type": "application/json" } }), TOKEN);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, status: "processado" });
    expect(rpcMock).toHaveBeenCalledWith("webhook_ingest", { _token_hash: await sha256Hex(TOKEN), _payload: { phone: "62999990001" } });
    expect(JSON.stringify(rpcMock.mock.calls)).not.toContain(TOKEN);
  });
  it("aceita GET com parâmetros na URL", async () => {
    const url = `https://painel.exemplo.com/api/public/hooks/${TOKEN}?phone=62999990001&mac=aa`;
    const r = await handleWifiHook(new Request(url), TOKEN);
    expect(r.status).toBe(200);
    expect(rpcMock.mock.calls[0]?.[1]._payload).toEqual({ phone: "62999990001", mac: "aa" });
  });
  it("token com formato errado não chega no banco", async () => {
    const r = await handleWifiHook(req("{}"), "abc");
    expect(r.status).toBe(404);
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it("endereço desconhecido ou desligado vira 404; limite vira 429", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: false, error: "NOT_FOUND" }, error: null });
    expect((await handleWifiHook(req("{}"), TOKEN)).status).toBe(404);
    rpcMock.mockResolvedValueOnce({ data: { ok: false, error: "RATE_LIMITED" }, error: null });
    expect((await handleWifiHook(req("{}"), TOKEN)).status).toBe(429);
  });
  it("corpo grande demais e corpo ilegível são recusados sem tocar no banco", async () => {
    const big = JSON.stringify({ x: "a".repeat(33 * 1024) });
    expect((await handleWifiHook(req(big, { headers: { "content-type": "application/json" } }), TOKEN)).status).toBe(413);
    expect((await handleWifiHook(req("{quebrado", { headers: { "content-type": "application/json" } }), TOKEN)).status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it("erro do banco vira 500 sem vazar detalhe", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "relation x does not exist" } });
    const r = await handleWifiHook(req("{}"), TOKEN);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("relation");
  });
});
