import { ApiError } from "@/lib/integration/errors";
import {
  availabilityQuery, classifyBody, createReservationBody, findReservationsQuery, handoffBody, patchReservationBody, sacBody,
} from "@/lib/integration/sdr-schemas";
import { cancelMessage, handoffMessage, reservationMessage, reservationUpdateMessage, sacMessage } from "@/lib/integration/messages";
import { db, handleSdr, parseWith, rpc } from "./sdr.server";

type Unit = { id: string; slug: string; name: string };
type ResOut = { protocol: string; status: string; previous_status: string; unit_name: string; date: string; time: string; party_size: number; is_large_group: boolean };

export const listUnits = (request: Request) =>
  handleSdr(request, { endpoint: "/units", scope: "read" }, async () => ({ data: await rpc("sdr_list_units", {}) }));

export const availability = (request: Request) =>
  handleSdr(request, { endpoint: "/availability", scope: "read" }, async ({ url }) => {
    const q = parseWith(availabilityQuery, Object.fromEntries(url.searchParams));
    const units = await rpc<Unit[]>("sdr_list_units", {});
    const unit = units.find((u) => u.id === q.unit_id || u.slug === q.unit_slug);
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
    const span = (Date.parse(q.to!) - Date.parse(q.from!)) / 86400000;
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
    });
    return { status: 201, data: r, mensagem_sugerida: reservationMessage(r) };
  });

export const findReservations = (request: Request) =>
  handleSdr(request, { endpoint: "/reservations", scope: "read" }, async ({ url }) => {
    const q = parseWith(findReservationsQuery, Object.fromEntries(url.searchParams));
    const list = await rpc<unknown[]>("sdr_find_reservations", { _phone: q.phone, _protocol: q.protocol ?? null });
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
