import { ApiError } from "@/lib/integration/errors";
import {
  availabilityQuery, classifyBody, contextQuery, createReservationBody, crmSendMarkBody, crmSendsDueQuery, deliveryBody, findDeliveryQuery, findReservationsQuery,
  followupMarkBody, followupsDueQuery, handoffBody, patchReservationBody, pricesQuery, sacBody,
} from "@/lib/integration/sdr-schemas";
import { cancelMessage, deliveryMessage, handoffMessage, reservationMessage, reservationUpdateMessage, sacMessage } from "@/lib/integration/messages";
import { PRICE_DISCLAIMER, WEEKDAY_NAMES, formatServices, priceText, type RawPrices } from "@/lib/prices";
import { db, handleSdr, parseWith, rpc } from "./sdr.server";
import type { ApiKeyCtx } from "./sdr.server";
import { scopedResults, scopedUnits } from "./sdr-scope.server";

type Unit = { id: string; slug: string; name: string; city?: string | null; services?: string[]; has_delivery?: boolean };
type ResOut = { protocol: string; status: string; previous_status: string; unit_name: string; date: string; time: string; party_size: number; is_large_group: boolean };

const todaySp = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Unidade por id, slug ou caixa de entrada do CRM ("conta:caixa" ou só o id da caixa). Null se não achar. */
async function findUnit(key: ApiKeyCtx, q: { unit_id?: string | undefined; unit_slug?: string | undefined; inbox?: string | undefined }): Promise<Unit | null> {
  const units = scopedUnits(key, await rpc<Unit[]>("sdr_list_units", {}));
  if (q.unit_id) return units.find((u) => u.id === q.unit_id) ?? null;
  if (q.unit_slug) return units.find((u) => u.slug === q.unit_slug) ?? null;
  if (q.inbox) {
    const id = await rpc<string | null>("sdr_unit_by_inbox", { _inbox: q.inbox });
    return id ? units.find((u) => u.id === id) ?? null : null;
  }
  return null;
}

async function pricesFor(unitId: string, date: string) {
  const raw = await rpc<RawPrices | null>("resolve_unit_prices", { _unit_id: unitId, _date: date });
  if (!raw) throw new ApiError("UNIT_NOT_FOUND");
  return {
    unidade: raw.unit.name,
    data: raw.date,
    dia_da_semana: raw.is_holiday && raw.holiday_name ? `feriado (${raw.holiday_name})` : WEEKDAY_NAMES[raw.weekday],
    servicos: formatServices(raw),
    aviso: PRICE_DISCLAIMER,
    texto: priceText(raw),
  };
}

/** Valores vigentes da unidade na data (padrão: hoje). Nunca invente valores: use esta resposta. */
export const prices = (request: Request) =>
  handleSdr(request, { endpoint: "/prices", scope: "read" }, async ({ url, key }) => {
    const q = parseWith(pricesQuery, Object.fromEntries(url.searchParams));
    const unit = await findUnit(key, q);
    if (!unit) throw new ApiError("UNIT_NOT_FOUND");
    return { data: await pricesFor(unit.id, q.date ?? todaySp()) };
  });

/**
 * Contexto para abrir uma conversa: data de hoje, unidade da caixa de entrada (ou null se a caixa não estiver
 * mapeada: aí o atendente pergunta a unidade), lista de unidades e, havendo unidade, os valores de hoje.
 */
export const context = (request: Request) =>
  handleSdr(request, { endpoint: "/context", scope: "read" }, async ({ url, key }) => {
    const q = parseWith(contextQuery, Object.fromEntries(url.searchParams));
    const date = q.date ?? todaySp();
    const units = scopedUnits(key, await rpc<Unit[]>("sdr_list_units", {}));
    const unit = await findUnit(key, q);
    if (key.unit_ids.length && (q.unit_id || q.unit_slug) && !unit) throw new ApiError("UNIT_NOT_FOUND");
    const unidades = units.map((u) => ({ id: u.id, slug: u.slug, nome: u.name, cidade: u.city ?? null, servicos: u.services ?? [], delivery: u.has_delivery ?? false }));
    const precos = unit ? await pricesFor(unit.id, date) : null;
    return {
      data: {
        hoje: { data: date, dia_da_semana: precos?.dia_da_semana ?? WEEKDAY_NAMES[new Date(`${date}T12:00:00`).getDay()] },
        unidade: unit,
        unidades,
        precos,
      },
    };
  });

export const createDelivery = (request: Request) =>
  handleSdr(request, { endpoint: "/delivery", scope: "write", idempotent: true }, async ({ body }) => {
    const b = parseWith(deliveryBody, body);
    const r = await rpc<{ protocol: string; status: string; unit_name: string }>("sdr_create_delivery_order", {
      _unit_id: b.unit_id, _full_name: b.full_name, _phone: b.phone, _items_text: b.items, _address: b.address,
      _neighborhood: b.neighborhood ?? null, _address_reference: b.address_reference ?? null, _payment_method: b.payment_method ?? null,
      _change_for: b.change_for ?? null, _notes: b.notes ?? null, _conversation_external_id: b.conversation_external_id ?? null,
    });
    return { status: 201, data: r, mensagem_sugerida: deliveryMessage(r.protocol) };
  });

export const findDelivery = (request: Request) =>
  handleSdr(request, { endpoint: "/delivery", scope: "read" }, async ({ url, key }) => {
    const q = parseWith(findDeliveryQuery, Object.fromEntries(url.searchParams));
    const list = await scopedResults(db(), key, "delivery_orders", await rpc<{ protocol: string }[]>("sdr_get_delivery_orders", { _phone: q.phone, _protocol: q.protocol ?? null }));
    return { data: list, mensagem_sugerida: list.length ? undefined : "Não encontrei pedidos de delivery recentes para este telefone." };
  });

/** Lembretes de reserva a enviar agora (véspera e no dia). Quem envia é o fluxo agendado do n8n. */
export const followupsDue = (request: Request) =>
  handleSdr(request, { endpoint: "/followups/due", scope: "read" }, async ({ url, key }) => {
    const q = parseWith(followupsDueQuery, Object.fromEntries(url.searchParams));
    return { data: key.unit_ids.length
      ? await rpc<unknown[]>("sdr_scoped_followups_due", { _unit_ids: key.unit_ids, _limit: q.limit })
      : await rpc<unknown[]>("sdr_followups_due", { _limit: q.limit }) };
  });

export const markFollowup = (request: Request) =>
  handleSdr(request, { endpoint: "/followups", scope: "write" }, async ({ body }) => {
    const b = parseWith(followupMarkBody, body);
    await rpc("sdr_mark_followup", { _protocol: b.protocol, _kind: b.kind, _ok: b.ok, _error: b.error ?? null });
    return { data: { protocol: b.protocol, kind: b.kind, ok: b.ok } };
  });

/**
 * Mensagens de CRM prontas para enviar (follow-up pós-visita, reaver, remarketing). O banco só libera dentro da janela
 * de horário e do teto diário, e nunca para quem pediu para sair. Quem envia é o fluxo do n8n.
 */
export const crmSendsDue = (request: Request) =>
  handleSdr(request, { endpoint: "/crm/sends/due", scope: "read" }, async ({ url, key }) => {
    const q = parseWith(crmSendsDueQuery, Object.fromEntries(url.searchParams));
    const rows = await rpc<unknown[] | null>("sdr_crm_sends_due", { _limit: q.limit, _unit_ids: key.unit_ids.length ? key.unit_ids : null });
    return { data: rows ?? [] };
  });

export const markCrmSend = (request: Request) =>
  handleSdr(request, { endpoint: "/crm/sends", scope: "write" }, async ({ body }) => {
    const b = parseWith(crmSendMarkBody, body);
    await rpc("sdr_mark_crm_send", { _id: b.id, _ok: b.ok, _error: b.error ?? null });
    return { data: { id: b.id, ok: b.ok } };
  });

export const listUnits = (request: Request) =>
  handleSdr(request, { endpoint: "/units", scope: "read" }, async ({ key }) => ({ data: scopedUnits(key, await rpc<Unit[]>("sdr_list_units", {})) }));

export const availability = (request: Request) =>
  handleSdr(request, { endpoint: "/availability", scope: "read" }, async ({ url, key }) => {
    const q = parseWith(availabilityQuery, Object.fromEntries(url.searchParams));
    const unit = await findUnit(key, q);
    if (!unit) throw new ApiError("UNIT_UNAVAILABLE");
    if (q.date) {
      const slots = await rpc<{ slot_time: string; remaining: number; available: boolean }[]>("get_unit_slots", {
        _unit_id: unit.id, _date: q.date, _party_size: q.party_size,
      });
      const free = (slots ?? []).filter((s) => s.available).map((s) => ({ time: s.slot_time.slice(0, 5), remaining_seats: s.remaining }));
      return {
        data: { unit_id: unit.id, unit_name: unit.name, date: q.date, party_size: q.party_size, slots: free },
        mensagem_sugerida: free.length ? undefined : "Não há horários com vaga nessa data para essa quantidade de pessoas.",
      };
    }
    if (!q.to || !q.from) throw new ApiError("VALIDATION_ERROR");
    const span = (Date.parse(q.to) - Date.parse(q.from)) / 86400000;
    if (!(span >= 0 && span <= 60)) throw new ApiError("VALIDATION_ERROR", "O intervalo from/to deve ter no máximo 60 dias.");
    const dates = await rpc<{ available_date: string }[]>("get_unit_available_dates", {
      _unit_id: unit.id, _from: q.from, _to: q.to, _party_size: q.party_size,
    });
    return { data: { unit_id: unit.id, unit_name: unit.name, from: q.from, to: q.to, party_size: q.party_size, dates: (dates ?? []).map((d) => d.available_date) } };
  });

export const createReservation = (request: Request) =>
  handleSdr(request, { endpoint: "/reservations", scope: "write", idempotent: true }, async ({ body }) => {
    const b = parseWith(createReservationBody, body);
    const r = await rpc<ResOut>("sdr_create_reservation", {
      _unit_id: b.unit_id, _date: b.date, _time: b.time, _party_size: b.party_size, _full_name: b.full_name, _phone: b.phone,
      _notes: b.notes ?? null, _whatsapp_opt_in: b.whatsapp_opt_in,
      _conversation_external_id: b.conversation_external_id ?? null, _contact_external_id: b.contact_external_id ?? null,
      _service: b.service ?? null, _occasion: b.occasion ?? null, _celebrant_name: b.celebrant_name ?? null,
    });
    return { status: 201, data: r, mensagem_sugerida: reservationMessage(r) };
  });

export const findReservations = (request: Request) =>
  handleSdr(request, { endpoint: "/reservations", scope: "read" }, async ({ url, key }) => {
    const q = parseWith(findReservationsQuery, Object.fromEntries(url.searchParams));
    const list = await scopedResults(db(), key, "reservations", await rpc<{ protocol: string }[]>("sdr_find_reservations", { _phone: q.phone, _protocol: q.protocol ?? null }));
    return { data: list, mensagem_sugerida: list.length ? undefined : "Não encontrei reservas recentes para este telefone." };
  });

export const patchReservation = (request: Request, protocol: string) =>
  handleSdr(request, { endpoint: "/reservations/{protocol}", scope: "write", idempotent: true }, async ({ body }) => {
    if (!/^[A-Za-z0-9-]{6,40}$/.test(protocol)) throw new ApiError("RESERVATION_NOT_FOUND");
    const b = parseWith(patchReservationBody, body);
    if (b.action === "cancelar") {
      const r = await rpc<{ protocol: string }>("sdr_cancel_reservation", { _protocol: protocol, _phone: b.phone, _reason: b.reason });
      return { data: r, mensagem_sugerida: cancelMessage(r.protocol) };
    }
    const r = await rpc<ResOut>("sdr_update_reservation", {
      _protocol: protocol, _phone: b.phone, _date: b.date ?? null, _time: b.time ?? null, _party_size: b.party_size ?? null,
    });
    return { data: r, mensagem_sugerida: reservationUpdateMessage(r) };
  });

export const createSac = (request: Request) =>
  handleSdr(request, { endpoint: "/sac", scope: "write", idempotent: true }, async ({ body }) => {
    const b = parseWith(sacBody, body);
    const r = await rpc<{ protocol: string; status: string }>("sdr_create_sac", {
      _category: b.category, _subject: b.subject, _description: b.description ?? null, _unit_id: b.unit_id ?? null,
      _phone: b.phone, _full_name: b.full_name ?? null, _priority: b.priority, _human_requested: b.human_requested,
      _conversation_external_id: b.conversation_external_id ?? null,
    });
    return { status: 201, data: { protocol: r.protocol, status: r.status }, mensagem_sugerida: sacMessage(r.protocol) };
  });

export const classify = (request: Request) =>
  handleSdr(request, { endpoint: "/conversations/classify", scope: "write" }, async ({ body }) => {
    const b = parseWith(classifyBody, body);
    const r = await rpc<{ conversation_id: string; created: boolean }>("sdr_classify_conversation", {
      _external_id: b.external_id, _classification: b.classification, _intent: b.intent ?? null, _tags: b.tags ?? null,
      _unit_id: b.unit_id ?? null, _result: b.result ?? null, _summary: b.summary ?? null,
      _started_at: b.started_at ?? null, _completed_at: b.completed_at ?? null,
      _reservation_protocol: b.reservation_protocol ?? null, _sac_protocol: b.sac_protocol ?? null,
      _contact_external_id: b.contact_external_id ?? null, _phone: b.phone ?? null, _contact_name: b.contact_name ?? null,
      _channel: b.channel,
    });
    return { data: r };
  });

export const handoff = (request: Request) =>
  handleSdr(request, { endpoint: "/handoff", scope: "write", idempotent: true }, async ({ body }) => {
    const b = parseWith(handoffBody, body);
    const r = await rpc<{ sac_protocol: string; sac_created: boolean }>("sdr_handoff", {
      _conversation_external_id: b.conversation_external_id, _phone: b.phone, _full_name: b.full_name ?? null,
      _unit_id: b.unit_id ?? null, _reason: b.reason ?? null,
    });
    return { data: r, mensagem_sugerida: handoffMessage() };
  });

export { db };
