// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  units: [] as Record<string, unknown>[],
  rows: {} as Record<string, Record<string, unknown>[]>,
  key: { id: "key-goiania", organization_id: "org", prefix: "test", scopes: ["read", "write"], unit_ids: [] as string[] },
  calls: [] as { name: string; args: Record<string, unknown> }[],
  queryError: false,
  replay: null as unknown,
}));

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(table: string) {
    let rows = table === "units" ? [...state.units] : [...(state.rows[table] ?? [])];
    const result = () => ({ data: rows, error: state.queryError && !["api_idempotency", "integration_event_logs"].includes(table) ? { message: "failed" } : null });
    const chain = {
      select: () => chain,
      eq: (field: string, value: unknown) => { rows = rows.filter((r) => r[field] === value); return chain; },
      in: (field: string, values: unknown[]) => { rows = rows.filter((r) => values.includes(r[field])); return chain; },
      lt: () => chain,
      insert: () => chain, update: () => chain, delete: () => chain,
      maybeSingle: async () => table === "api_idempotency" ? { data: state.replay, error: null } : { ...result(), data: rows[0] ?? null },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  },
  async rpc(name: string, args: Record<string, unknown>) {
    state.calls.push({ name, args });
    const out: Record<string, unknown> = {
      sdr_auth: { ...state.key, rate_limited: false },
      sdr_list_units: state.units,
      sdr_unit_by_inbox: state.units[1]?.id,
      sdr_find_reservations: state.rows.reservations,
      sdr_get_delivery_orders: state.rows.delivery_orders,
      sdr_followups_due: state.rows.reservations,
      sdr_scoped_followups_due: (state.rows.reservations ?? []).filter((r) => (args._unit_ids as string[]).includes(r.unit_id as string)),
      get_unit_slots: [{ slot_time: "19:00:00", remaining: 10, available: true }],
      get_unit_available_dates: [{ available_date: "2026-11-20" }],
      resolve_unit_prices: { unit: { name: "Unidade" }, date: "2026-11-20", weekday: 5, is_holiday: false, services: [] },
    };
    return { data: out[name] ?? { protocol: "CAD-GOIANIA", status: "pendente", unit_name: "Goiânia", date: "2026-11-20", time: "19:00", party_size: 2 }, error: null };
  },
} }));

import * as h from "@/server/sdr-handlers.server";
import { sha256Hex } from "@/lib/integration/crypto";

const GO = "11111111-1111-4111-8111-111111111111";
const AN = "22222222-2222-4222-8222-222222222222";
const MISSING = "33333333-3333-4333-8333-333333333333";
const phone = "62999999999";
const reservation = (unit_id: string) => ({ unit_id, full_name: "Cliente Teste", phone, date: "2026-11-20", time: "19:00", party_size: 2 });
const delivery = (unit_id: string) => ({ unit_id, full_name: "Cliente Teste", phone, items: "Pizza", address: "Rua de teste, 1" });
const request = (path: string, body?: unknown, method = body ? "POST" : "GET", idem?: string) => new Request(`http://localhost/api/public/sdr${path}`, {
  method, headers: { Authorization: "Bearer test-only-not-real", ...(body ? { "content-type": "application/json" } : {}), ...(idem ? { "Idempotency-Key": idem } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const mutatingCalls = () => state.calls.filter((c) => /sdr_(create|update|cancel|mark|classify|handoff)/.test(c.name));

beforeEach(() => {
  state.key.unit_ids = [GO]; state.key.scopes = ["read", "write"];
  state.units = [{ id: GO, slug: "goiania", name: "Candeeiro Goiânia", organization_id: "org" }, { id: AN, slug: "anapolis", name: "Candeeiro Anápolis", organization_id: "org" }];
  state.rows = {
    reservations: [{ id: "r-go", protocol: "CAD-GOIANIA", unit_id: GO, organization_id: "org" }, { id: "r-an", protocol: "CAD-ANAPOLIS", unit_id: AN, organization_id: "org" }],
    delivery_orders: [{ protocol: "DEL-GOIANIA", unit_id: GO, organization_id: "org" }, { protocol: "DEL-ANAPOLIS", unit_id: AN, organization_id: "org" }],
    sac_tickets: [{ id: "s-an", protocol: "SAC-ANAPOLIS", unit_id: AN, organization_id: "org" }],
    crm_conversations: [{ external_id: "anapolis-conv", unit_id: AN, organization_id: "org" }],
  };
  state.calls = []; state.queryError = false; state.replay = null;
});

describe("chave Goiânia: todos os endpoints", () => {
  it("/units lista somente Goiânia", async () => {
    expect((await (await h.listUnits(request("/units"))).json()).data.map((u: { id: string }) => u.id)).toEqual([GO]);
  });
  it("/context não revela caixa de Anápolis", async () => {
    const r = await (await h.context(request("/context?inbox=15:49"))).json();
    expect(r.data.unidade).toBeNull(); expect(r.data.precos).toBeNull(); expect(r.data.unidades.map((u: { id: string }) => u.id)).toEqual([GO]);
  });
  it.each(["unit_id", "unit_slug"])("/context rejeita seletor %s de Anápolis", async (selector) => {
    const r = await h.context(request(`/context?${selector}=${selector === "unit_id" ? AN : "anapolis"}`));
    expect(r.status).toBe(404); expect((await r.json()).error.code).toBe("UNIT_NOT_FOUND");
  });
  it.each(["unit_id", "unit_slug", "inbox"])("/prices rejeita Anápolis via %s", async (selector) => {
    const r = await h.prices(request(`/prices?${selector}=${selector === "unit_id" ? AN : selector === "unit_slug" ? "anapolis" : "15:49"}`));
    expect(r.status).toBe(404); expect((await r.json()).error.code).toBe("UNIT_NOT_FOUND");
    expect(state.calls.some((c) => c.name === "resolve_unit_prices")).toBe(false);
  });
  it.each([`date=2026-11-20`, `from=2026-11-20&to=2026-11-25`])("/availability bloqueia Anápolis: %s", async (dates) => {
    const r = await h.availability(request(`/availability?unit_id=${AN}&${dates}`));
    expect(r.status).toBe(404); expect((await r.json()).error.code).toBe("UNIT_UNAVAILABLE");
    expect(state.calls.some((c) => /get_unit_(slots|available_dates)/.test(c.name))).toBe(false);
  });
  it("seletor proibido não pode ser contornado com slug permitido", async () => {
    expect((await h.availability(request(`/availability?unit_id=${AN}&unit_slug=goiania&date=2026-11-20`))).status).toBe(404);
  });
  it.each([
    ["reservations", h.findReservations, "CAD-GOIANIA"], ["delivery", h.findDelivery, "DEL-GOIANIA"],
  ] as const)("GET /%s filtra telefone e protocolo", async (path, handler, protocol) => {
    const r = await (await handler(request(`/${path}?phone=${phone}`))).json();
    expect(r.data.map((x: { protocol: string }) => x.protocol)).toEqual([protocol]);
    const onlyOther = await (await handler(request(`/${path}?phone=${phone}&protocol=OTHER`))).json();
    expect(onlyOther.data.every((x: { unit_id: string }) => x.unit_id === GO)).toBe(true);
  });
  it("/followups/due passa escopo ao RPC antes do limite", async () => {
    const r = await (await h.followupsDue(request("/followups/due?limit=1"))).json();
    expect(r.data.map((x: { unit_id: string }) => x.unit_id)).toEqual([GO]);
    expect(state.calls).toContainEqual({ name: "sdr_scoped_followups_due", args: { _unit_ids: [GO], _limit: 1 } });
    expect(state.calls.some((c) => c.name === "sdr_followups_due")).toBe(false);
  });
  const blocked = [
    ["POST reservations", () => h.createReservation(request("/reservations", reservation(AN))), "UNIT_UNAVAILABLE"],
    ["POST delivery", () => h.createDelivery(request("/delivery", delivery(AN))), "UNIT_NOT_FOUND"],
    ["PATCH alterar", () => h.patchReservation(request("/reservations/CAD-ANAPOLIS", { action: "alterar", phone, party_size: 3 }, "PATCH"), "CAD-ANAPOLIS"), "RESERVATION_NOT_FOUND"],
    ["PATCH cancelar", () => h.patchReservation(request("/reservations/CAD-ANAPOLIS", { action: "cancelar", phone, reason: "Mudança de planos" }, "PATCH"), "CAD-ANAPOLIS"), "RESERVATION_NOT_FOUND"],
    ["POST sac", () => h.createSac(request("/sac", { unit_id: AN, phone, category: "duvida", subject: "Dúvida teste" })), "UNIT_NOT_FOUND"],
    ["POST handoff", () => h.handoff(request("/handoff", { unit_id: AN, phone, conversation_external_id: "novo" })), "UNIT_NOT_FOUND"],
    ["POST classify", () => h.classify(request("/conversations/classify", { unit_id: AN, external_id: "novo", classification: "outros" })), "UNIT_NOT_FOUND"],
    ["POST followups", () => h.markFollowup(request("/followups", { protocol: "CAD-ANAPOLIS", kind: "lembrete_dia", ok: true })), "RESERVATION_NOT_FOUND"],
  ] as const;
  it.each(blocked)("%s não executa escrita de Anápolis", async (_label, call, code) => {
    const r = await call(); expect(r.status).toBe(404); expect((await r.json()).error.code).toBe(code); expect(mutatingCalls()).toEqual([]);
  });
  it.each(["reservation_protocol", "sac_protocol"])("classificação rejeita vínculo %s de Anápolis", async (field) => {
    const r = await h.classify(request("/conversations/classify", { unit_id: GO, external_id: "novo", classification: "outros", [field]: field === "reservation_protocol" ? "CAD-ANAPOLIS" : "SAC-ANAPOLIS" }));
    expect(r.status).toBe(404); expect(mutatingCalls()).toEqual([]);
  });
  it.each([h.createReservation, h.createSac, h.handoff, h.createDelivery])("rejeita conversa existente de outra unidade", async (handler) => {
    const bodies = new Map([[h.createReservation, reservation(GO)], [h.createDelivery, delivery(GO)], [h.createSac, { phone, category: "duvida", subject: "Dúvida teste" }], [h.handoff, { phone }]]);
    const paths = new Map([[h.createReservation, "/reservations"], [h.createDelivery, "/delivery"], [h.createSac, "/sac"], [h.handoff, "/handoff"]]);
    const r = await handler(request(paths.get(handler) ?? "", { ...bodies.get(handler), conversation_external_id: "anapolis-conv" }));
    expect(r.status).toBe(404); expect(mutatingCalls()).toEqual([]);
  });
  it("conversa sem unidade com reserva de Anápolis também é rejeitada", async () => {
    state.rows.crm_conversations = [{ external_id: "sem-unidade", unit_id: null, reservation_id: "r-an", organization_id: "org" }];
    const r = await h.handoff(request("/handoff", { phone, conversation_external_id: "sem-unidade" }));
    expect(r.status).toBe(404); expect(mutatingCalls()).toEqual([]);
  });
  it("classificação não pode tomar conversa de Anápolis nem omitindo unit_id", async () => {
    expect((await h.classify(request("/conversations/classify", { external_id: "anapolis-conv", classification: "outros" }))).status).toBe(404);
    expect(mutatingCalls()).toEqual([]);
  });
  it.each(["sac", "handoff"])("/%s sem unidade continua permitido", async (path) => {
    const r = path === "sac" ? await h.createSac(request("/sac", { phone, category: "duvida", subject: "Dúvida teste" })) : await h.handoff(request("/handoff", { phone, conversation_external_id: "novo" }));
    expect(r.status).toBe(path === "sac" ? 201 : 200);
  });
  it("unidade inexistente e fora do escopo têm resposta idêntica", async () => {
    expect(await (await h.createReservation(request("/reservations", reservation(AN)))).json()).toEqual(await (await h.createReservation(request("/reservations", reservation(MISSING)))).json());
  });
  it("replay antigo de outra unidade é bloqueado antes da idempotência", async () => {
    const body = reservation(AN);
    state.replay = { request_hash: await sha256Hex(`POST /api/public/sdr/reservations ${JSON.stringify(body)}`), status_code: 201, response: { ok: true, data: { protocol: "CAD-ANAPOLIS" } }, expires_at: new Date(Date.now() + 86400000).toISOString() };
    const r = await h.createReservation(request("/reservations", body, "POST", "same-key-123"));
    expect(r.status).toBe(404); expect(mutatingCalls()).toEqual([]);
  });
  it("erro de consulta falha fechado sem executar mutação", async () => {
    state.queryError = true;
    expect((await h.createReservation(request("/reservations", reservation(GO)))).status).toBe(500);
    expect(mutatingCalls()).toEqual([]);
  });
});

describe("chave sem restrição: compatibilidade em todos os endpoints", () => {
  beforeEach(() => { state.key.unit_ids = []; });
  it.each([
    ["units", () => h.listUnits(request("/units"))],
    ["context", () => h.context(request("/context?unit_slug=anapolis"))],
    ["prices", () => h.prices(request(`/prices?unit_id=${AN}`))],
    ["availability", () => h.availability(request(`/availability?unit_id=${AN}&date=2026-11-20`))],
    ["delivery POST", () => h.createDelivery(request("/delivery", delivery(AN)))],
    ["delivery GET", () => h.findDelivery(request(`/delivery?phone=${phone}`))],
    ["reservations POST", () => h.createReservation(request("/reservations", reservation(AN)))],
    ["reservations GET", () => h.findReservations(request(`/reservations?phone=${phone}`))],
    ["reservations PATCH", () => h.patchReservation(request("/reservations/CAD-ANAPOLIS", { action: "cancelar", phone, reason: "Mudança de planos" }, "PATCH"), "CAD-ANAPOLIS")],
    ["sac", () => h.createSac(request("/sac", { unit_id: AN, phone, category: "duvida", subject: "Dúvida teste" }))],
    ["handoff", () => h.handoff(request("/handoff", { unit_id: AN, phone, conversation_external_id: "anapolis-conv" }))],
    ["classify", () => h.classify(request("/conversations/classify", { unit_id: AN, external_id: "anapolis-conv", classification: "outros" }))],
    ["followups due", () => h.followupsDue(request("/followups/due"))],
    ["followups mark", () => h.markFollowup(request("/followups", { protocol: "CAD-ANAPOLIS", kind: "lembrete_dia", ok: true }))],
  ])("%s mantém acesso legado", async (_name, call) => {
    const r = await call(); expect(r.status).toBeLessThan(300); expect((await r.json()).ok).toBe(true);
  });
  it("listas antigas continuam contendo ambas as unidades", async () => {
    expect((await (await h.listUnits(request("/units"))).json()).data).toHaveLength(2);
    expect((await (await h.findDelivery(request(`/delivery?phone=${phone}`))).json()).data).toHaveLength(2);
    expect((await (await h.findReservations(request(`/reservations?phone=${phone}`))).json()).data).toHaveLength(2);
  });
});