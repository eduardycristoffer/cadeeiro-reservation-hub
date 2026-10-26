import { extractChatwootPhone } from "./phone";

export const SUPPORTED_EVENTS = [
  "conversation_created",
  "conversation_status_changed",
  "conversation_updated",
  "message_created",
  "contact_created",
  "contact_updated",
] as const;
export type SupportedEvent = (typeof SUPPORTED_EVENTS)[number];

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const s = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

/** Converte segundos Unix ou ISO em ISO; null se inválido. */
export function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : /^\d+(\.\d+)?$/.test(String(v)) ? Number(v) : NaN;
  const d = Number.isFinite(n) ? new Date(n * 1000) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Texto de opt-out: exatamente PARAR, SAIR ou STOP, ignorando maiúsculas e espaços. */
export function isOptOutText(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const t = text.replace(/\s+/g, "").toUpperCase();
  return t === "PARAR" || t === "SAIR" || t === "STOP";
}

/**
 * event_id determinístico: evento + tipo do objeto + id + carimbo de tempo
 * (+ status, nos eventos de conversa).
 * O mesmo webhook reenviado gera o mesmo id (idempotência em crm_events).
 * O Chatwoot só tem precisão de segundos: duas mudanças de status no mesmo
 * segundo teriam o mesmo id e a segunda seria descartada como duplicada.
 */
export function buildInboundEventId(event: string, payload: Obj, headerTimestamp?: string | null): string {
  const isMessage = event === "message_created";
  const isContact = event.startsWith("contact_");
  const kind = isMessage ? "msg" : isContact ? "contact" : "conv";
  const id = s(payload["id"]) ?? "0";
  const ts =
    toIso(isMessage ? payload["created_at"] : payload["updated_at"] ?? payload["timestamp"] ?? payload["created_at"]) ??
    toIso(headerTimestamp) ??
    "na";
  const status = kind === "conv" ? s(payload["status"]) : null;
  return status ? `${event}:${kind}:${id}:${ts}:${status}` : `${event}:${kind}:${id}:${ts}`;
}

export type NormalizedInbound = {
  contact: { external_id: string; name: string | null; phone: string | null } | null;
  conversation: { external_id: string; status: string | null; inbox_id: string | null; started_at: string | null } | null;
  message: { external_id: string; created_at: string | null; incoming: boolean; opt_out: boolean } | null;
};

/**
 * Normaliza o payload do Chatwoot SEM guardar o texto das mensagens.
 * Só o resultado booleano do teste de opt-out sai daqui.
 */
export function normalizeChatwootPayload(event: SupportedEvent, p: Obj): NormalizedInbound {
  const out: NormalizedInbound = { contact: null, conversation: null, message: null };

  const contactFrom = (c: Obj | null, sourceId?: string | null) => {
    if (!c || s(c["id"]) === null) return null;
    return {
      external_id: String(c["id"]),
      name: s(c["name"]),
      phone: extractChatwootPhone({ phone_number: s(c["phone_number"]), identifier: s(c["identifier"]), source_id: sourceId ?? null }),
    };
  };
  const convFrom = (c: Obj | null) => {
    if (!c || s(c["id"]) === null) return null;
    return { external_id: String(c["id"]), status: s(c["status"]), inbox_id: s(c["inbox_id"]), started_at: toIso(c["created_at"]) };
  };

  if (event === "contact_created" || event === "contact_updated") {
    out.contact = contactFrom(p);
    return out;
  }

  if (event === "message_created") {
    const conv = o(p["conversation"]);
    const sender = o(p["sender"]);
    const ci = o(conv?.["contact_inbox"]);
    const incoming = p["message_type"] === "incoming" || p["message_type"] === 0;
    const senderIsContact = !sender || s(sender["type"]) === null || s(sender["type"]) === "contact";
    out.conversation = convFrom(conv ? { ...conv, inbox_id: conv["inbox_id"] ?? o(p["inbox"])?.["id"] } : null);
    if (incoming && senderIsContact) out.contact = contactFrom(sender ?? o(o(conv?.["meta"])?.["sender"]), s(ci?.["source_id"]));
    out.message = {
      external_id: String(p["id"] ?? ""),
      created_at: toIso(p["created_at"]),
      incoming,
      opt_out: incoming && isOptOutText(p["content"]),
    };
    return out;
  }

  // eventos de conversa
  out.conversation = convFrom(p);
  const ci = o(p["contact_inbox"]);
  out.contact = contactFrom(o(o(p["meta"])?.["sender"]), s(ci?.["source_id"]));
  return out;
}
