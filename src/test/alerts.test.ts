import { describe, expect, it } from "vitest";
import { groupByDay, parseEmailSettings, parseNotifications, settingsPayload } from "@/lib/alerts";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const row = (over: Record<string, unknown> = {}) => ({ id: ID1, kind: "reserva_pendente", severity: "info", title: "Reserva nova", body: "Maria · 4 pessoas", link: "/admin/aprovacoes", created_at: "2026-11-12T20:00:00Z", ...over });

describe("parseNotifications", () => {
  it("lê a linha e marca como lida quando a pessoa já leu", () => {
    const [a, b] = parseNotifications([row(), row({ id: ID2, created_at: "2026-11-12T21:00:00Z" })], [ID1]);
    expect(b?.id).toBe(ID1); expect(b?.read).toBe(true);
    expect(a?.id).toBe(ID2); expect(a?.read).toBe(false);
  });
  it("ordena do mais novo para o mais antigo", () => {
    const out = parseNotifications([row({ id: ID1, created_at: "2026-11-10T10:00:00Z" }), row({ id: ID2, created_at: "2026-11-12T10:00:00Z" })], []);
    expect(out.map((n) => n.id)).toEqual([ID2, ID1]);
  });
  it("descarta linha inválida e limpa campos estranhos", () => {
    const out = parseNotifications([
      row({ id: "x" }), row({ kind: "outro" }), row({ title: "" }), row({ created_at: "ontem" }), null, "texto",
      row({ id: ID3, severity: "gravissimo", link: "https://mal.com/x" }),
    ], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: ID3, severity: "info", link: null });
  });
  it("entrada que não é lista vira lista vazia", () => {
    expect(parseNotifications(null, [])).toEqual([]);
    expect(parseNotifications({}, [])).toEqual([]);
  });
});

describe("groupByDay", () => {
  const at = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();
  it("separa Hoje, Ontem e datas antigas", () => {
    const list = parseNotifications([row({ id: ID1, created_at: at(12, 15) }), row({ id: ID2, created_at: at(12, 9) }), row({ id: ID3, created_at: at(11) }), row({ id: "44444444-4444-4444-8444-444444444444", created_at: at(5) })], []);
    const g = groupByDay(list, new Date(2026, 10, 12, 18));
    expect(g.map((x) => x.label)).toEqual(["Hoje", "Ontem", "05/11"]);
    expect(g[0]?.items).toHaveLength(2);
  });
});

describe("parseEmailSettings", () => {
  it("lê configuração completa", () => {
    const s = parseEmailSettings({ email_enabled: false, email_kinds: { reserva_pendente: false, lead_whatsapp: true }, extra_emails: ["a@x.com", 3], queue: { pending: 2, sent_7d: 10, failed_7d: 1, last_error: "Resend 403" } });
    expect(s?.email_enabled).toBe(false);
    expect(s?.email_kinds.reserva_pendente).toBe(false);
    expect(s?.email_kinds.lead_whatsapp).toBe(true);
    expect(s?.email_kinds.sac_novo).toBe(true);
    expect(s?.extra_emails).toEqual(["a@x.com"]);
    expect(s?.queue).toEqual({ pending: 2, sent_7d: 10, failed_7d: 1, last_error: "Resend 403" });
  });
  it("sem dados usa os padrões: tudo ligado, menos lead do WhatsApp", () => {
    const s = parseEmailSettings({});
    expect(s?.email_enabled).toBe(true);
    expect(s?.email_kinds.reserva_pendente).toBe(true);
    expect(s?.email_kinds.lead_whatsapp).toBe(false);
    expect(s?.queue).toEqual({ pending: 0, sent_7d: 0, failed_7d: 0, last_error: null });
  });
  it("resposta inesperada vira null", () => {
    expect(parseEmailSettings(null)).toBeNull();
    expect(parseEmailSettings([])).toBeNull();
  });
});

describe("settingsPayload", () => {
  const kinds = parseEmailSettings({})!.email_kinds;
  it("separa e limpa os e-mails extras", () => {
    const r = settingsPayload({ email_enabled: true, email_kinds: kinds, extraText: "A@x.com, b@x.com;\nA@x.com" });
    expect(r).toEqual({ ok: true, payload: { email_enabled: true, email_kinds: kinds, extra_emails: ["a@x.com", "b@x.com"] } });
  });
  it("recusa e-mail inválido e lista grande demais", () => {
    expect(settingsPayload({ email_enabled: true, email_kinds: kinds, extraText: "a@x.com, nao-e-email" })).toEqual({ ok: false, error: "INVALID_EMAIL" });
    const many = Array.from({ length: 11 }, (_, i) => `p${i}@x.com`).join(",");
    expect(settingsPayload({ email_enabled: true, email_kinds: kinds, extraText: many })).toEqual({ ok: false, error: "TOO_MANY" });
  });
  it("texto vazio limpa a lista", () => {
    const r = settingsPayload({ email_enabled: false, email_kinds: kinds, extraText: "  " });
    expect(r.ok && r.payload.extra_emails).toEqual([]);
  });
});
