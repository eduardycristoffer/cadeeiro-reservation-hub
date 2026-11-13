// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/sdr.server", () => ({ rpc: rpcMock }));

import { runEmailWorker } from "@/server/email-worker.server";

const row = (n: number) => ({ id: `id-${n}`, to: `u${n}@exemplo.com`, subject: `Assunto ${n}`, text: `Corpo ${n}`, link_path: "/admin/aprovacoes", kind: "alerta" });

beforeEach(() => { rpcMock.mockReset(); vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("EMAIL_FROM", ""); vi.stubEnv("PUBLIC_APP_URL", ""); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("runEmailWorker", () => {
  it("sem provedor não retira nada da fila", async () => {
    expect(await runEmailWorker("https://app.exemplo.com")).toEqual({ ok: true, skipped: "sem_provedor" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("envia, registra sucesso e falha de cada e-mail e usa o endereço do painel", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_not_real"); vi.stubEnv("EMAIL_FROM", "Candeeiro <alertas@exemplo.com>"); vi.stubEnv("PUBLIC_APP_URL", "https://painel.exemplo.com");
    rpcMock.mockImplementation(async (name: string) => (name === "sdr_email_claim" ? [row(1), row(2), row(3)] : null));
    const sent: { to: string[]; text: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { to: string[]; text: string };
      sent.push(body);
      return body.to[0] === "u2@exemplo.com"
        ? new Response(JSON.stringify({ message: "domínio não verificado" }), { status: 403 })
        : new Response(JSON.stringify({ id: "msg" }), { status: 200 });
    }));
    expect(await runEmailWorker("https://origem.exemplo.com")).toEqual({ ok: true, claimed: 3, sent: 2, failed: 1 });
    expect(sent).toHaveLength(3);
    expect(sent[0]?.text).toContain("https://painel.exemplo.com/admin/aprovacoes");
    const marks = rpcMock.mock.calls.filter((c) => c[0] === "sdr_email_mark").map((c) => c[1]);
    expect(marks).toContainEqual({ _id: "id-1", _ok: true, _error: null });
    expect(marks).toContainEqual({ _id: "id-3", _ok: true, _error: null });
    const failed = marks.find((m) => m._id === "id-2");
    expect(failed._ok).toBe(false);
    expect(failed._error).toContain("403");
  });

  it("falha de rede vira erro registrado, não exceção", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_not_real"); vi.stubEnv("EMAIL_FROM", "alertas@exemplo.com");
    rpcMock.mockImplementation(async (name: string) => (name === "sdr_email_claim" ? [row(1)] : null));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await runEmailWorker("https://origem.exemplo.com")).toEqual({ ok: true, claimed: 1, sent: 0, failed: 1 });
    expect(rpcMock).toHaveBeenCalledWith("sdr_email_mark", { _id: "id-1", _ok: false, _error: "Resend: sem conexão" });
  });

  it("fila vazia não chama o Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_not_real"); vi.stubEnv("EMAIL_FROM", "alertas@exemplo.com");
    rpcMock.mockResolvedValue([]);
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await runEmailWorker("https://origem.exemplo.com")).toEqual({ ok: true, claimed: 0, sent: 0, failed: 0 });
    expect(f).not.toHaveBeenCalled();
  });
});
