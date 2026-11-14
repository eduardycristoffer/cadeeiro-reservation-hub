// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/sdr.server", () => ({ rpc: rpcMock }));

import { runPushWorker, pushPublicKey } from "@/server/push.server";
import { b64u } from "@/lib/integration/webpush";

async function subscriber() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { p256dh: b64u(pub), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
}
const item = (id: string, subs: unknown[]) => ({ id, kind: "alerta", notification_id: `n-${id}`, alert_kind: "reserva_pendente", severity: "info", title: "Nova reserva para aprovar", body: "Maria · 4 pessoas", link: "/admin/aprovacoes", subs });

beforeEach(() => { rpcMock.mockReset(); vi.stubEnv("PUSH_SEED", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", ""); vi.stubEnv("PUBLIC_APP_URL", ""); vi.stubEnv("PUSH_SUBJECT", ""); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("runPushWorker", () => {
  it("sem segredo no servidor não retira nada da fila", async () => {
    expect(await runPushWorker("https://app.exemplo.com")).toEqual({ ok: true, skipped: "sem_chave" });
    expect(await pushPublicKey()).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("manda para cada aparelho, registra o resultado e apaga aparelho que não existe mais", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-de-servico-de-teste-123456");
    const a = await subscriber(); const b = await subscriber(); const c = await subscriber();
    rpcMock.mockImplementation(async (name: string) => name === "sdr_push_claim" ? [
      item("1", [{ id: "s1", endpoint: "https://fcm.googleapis.com/fcm/send/a", ...a }, { id: "s2", endpoint: "https://web.push.apple.com/b", ...b }]),
      item("2", [{ id: "s3", endpoint: "https://fcm.googleapis.com/fcm/send/c", ...c }]),
      item("3", []),
    ] : null);
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      seen.push(url);
      expect((init.headers as Record<string, string>)["authorization"]).toMatch(/^vapid t=.+, k=.+$/);
      return new Response(null, { status: url.endsWith("/c") ? 410 : 201 });
    }));
    const r = await runPushWorker("https://painel.exemplo.com");
    expect(r).toEqual({ ok: true, claimed: 3, sent: 1, failed: 2, devices: 2 });
    expect(seen).toHaveLength(3);
    const calls = rpcMock.mock.calls.map(([n, args]) => [n, args] as const);
    expect(calls).toContainEqual(["sdr_push_sub_result", { _sub: "s1", _ok: true }]);
    expect(calls).toContainEqual(["sdr_push_sub_result", { _sub: "s3", _ok: false, _gone: true, _error: "push 410" }]);
    expect(calls).toContainEqual(["sdr_push_mark", { _id: "1", _sent: 2, _retry: false, _error: "erro" }]);
    expect(calls).toContainEqual(["sdr_push_mark", { _id: "3", _sent: 0, _retry: false, _error: null }]); // sem aparelho: cancela
  });

  it("falha de rede deixa o aviso para tentar de novo", async () => {
    vi.stubEnv("PUSH_SEED", "outra-chave-de-teste-1234567890");
    const a = await subscriber();
    rpcMock.mockImplementation(async (name: string) => name === "sdr_push_claim" ? [item("9", [{ id: "s9", endpoint: "https://fcm.googleapis.com/fcm/send/z", ...a }])] : null);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("rede"); }));
    expect(await runPushWorker("https://painel.exemplo.com")).toMatchObject({ claimed: 1, sent: 0, failed: 1 });
    expect(rpcMock).toHaveBeenCalledWith("sdr_push_mark", { _id: "9", _sent: 0, _retry: true, _error: "push: sem conexão" });
  });

  it("a chave pública é estável para o mesmo segredo", async () => {
    vi.stubEnv("PUSH_SEED", "segredo-estavel-1234567890abcdef");
    const k1 = await pushPublicKey(); const k2 = await pushPublicKey();
    expect(k1).toBeTruthy(); expect(k1).toBe(k2);
  });
});
