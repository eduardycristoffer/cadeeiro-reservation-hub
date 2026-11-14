// Wi-Fi do salão: lê o que o banco devolve e prepara o que a tela mostra. Lógica pura.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : null);

export type WifiTotals = { visits: number; guests: number; new_guests: number; returning_guests: number; with_phone: number; with_consent: number; reserved: number; reserved_after: number };
export type WifiOverview = { days: number; totals: WifiTotals; by_day: { day: string; visits: number; guests: number }[]; by_hour: { hour: number; visits: number }[] };

export function parseWifiOverview(raw: unknown): WifiOverview | null {
  if (!isObj(raw)) return null;
  const t = isObj(raw["totals"]) ? raw["totals"] : {};
  const by_day = Array.isArray(raw["by_day"]) ? raw["by_day"].filter(isObj).map((d) => ({ day: str(d["day"]) ?? "", visits: num(d["visits"]), guests: num(d["guests"]) })).filter((d) => d.day) : [];
  const by_hour = Array.isArray(raw["by_hour"]) ? raw["by_hour"].filter(isObj).map((d) => ({ hour: num(d["hour"]), visits: num(d["visits"]) })) : [];
  return {
    days: num(raw["days"]) || 30, by_day, by_hour,
    totals: { visits: num(t["visits"]), guests: num(t["guests"]), new_guests: num(t["new_guests"]), returning_guests: num(t["returning_guests"]), with_phone: num(t["with_phone"]), with_consent: num(t["with_consent"]), reserved: num(t["reserved"]), reserved_after: num(t["reserved_after"]) },
  };
}

/** Porcentagem inteira; "—" quando não há base para calcular. */
export function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

/** Altura relativa (0–100) de cada barra; barra com valor sempre aparece (mín. 4). */
export function barHeights(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max === 0 || v === 0 ? 0 : Math.max(4, Math.round((v / max) * 100))));
}

/** "2026-11-12" -> "12/11" */
export function dayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

export type WifiGuest = { id: string; name: string | null; phone: string | null; email: string | null; unit_name: string | null; visits: number; first_seen_at: string; last_seen_at: string; consent: boolean; reserved: boolean };

export function parseWifiGuests(raw: unknown): WifiGuest[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).flatMap((g) => {
    const id = str(g["id"]); const first = str(g["first_seen_at"]); const last = str(g["last_seen_at"]);
    if (!id || !first || !last) return [];
    return [{ id, name: str(g["name"]), phone: str(g["phone"]), email: str(g["email"]), unit_name: str(g["unit_name"]), visits: num(g["visits"]), first_seen_at: first, last_seen_at: last, consent: g["consent"] === true, reserved: g["reserved"] === true }];
  });
}

/** 5562999990001 -> (62) 99999-0001 */
export function phoneLabel(e164: string | null): string {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}

export type Endpoint = { id: string; name: string; kind: "wifi" | "generico"; unit_id: string | null; unit_name: string | null; token_hint: string; is_active: boolean; last_event_at: string | null; events_24h: number; events_7d: number; errors_7d: number; ignored_7d: number };

export function parseEndpoints(raw: unknown): Endpoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).flatMap((e) => {
    const id = str(e["id"]); const name = str(e["name"]);
    if (!id || !name) return [];
    return [{ id, name, kind: e["kind"] === "generico" ? "generico" : "wifi", unit_id: str(e["unit_id"]), unit_name: str(e["unit_name"]), token_hint: str(e["token_hint"]) ?? "", is_active: e["is_active"] !== false, last_event_at: str(e["last_event_at"]), events_24h: num(e["events_24h"]), events_7d: num(e["events_7d"]), errors_7d: num(e["errors_7d"]), ignored_7d: num(e["ignored_7d"]) }];
  });
}

export type HookEvent = { id: string; received_at: string; status: "processado" | "ignorado" | "erro"; error: string | null; payload: unknown };

export function parseHookEvents(raw: unknown): HookEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).flatMap((e) => {
    const id = str(e["id"]); const at = str(e["received_at"]); const s = e["status"];
    if (!id || !at || (s !== "processado" && s !== "ignorado" && s !== "erro")) return [];
    return [{ id, received_at: at, status: s, error: str(e["error"]), payload: e["payload"] }];
  });
}

export const EVENT_STATUS_LABEL: Record<HookEvent["status"], string> = { processado: "Recebido", ignorado: "Ignorado", erro: "Com erro" };
export const EVENT_REASON_LABEL: Record<string, string> = {
  SEM_IDENTIFICACAO: "Veio sem telefone, e-mail ou aparelho",
  DESCONEXAO: "Aviso de desconexão (não conta)",
  CORPO_INVALIDO: "O corpo não era um objeto válido",
};

/** Endereço completo que o sistema de Wi-Fi vai chamar. */
export function hookUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/api/public/hooks/${token}`;
}

export const HOOK_EXAMPLE = `{
  "event": "connect",
  "name": "João da Silva",
  "phone": "(62) 99999-0001",
  "email": "joao@email.com",
  "mac": "AA:BB:CC:DD:EE:01",
  "consent": true
}`;

export const HOOK_FIELDS: { field: string; names: string }[] = [
  { field: "Nome", names: "name, nome, full_name, guest_name, username" },
  { field: "Telefone", names: "phone, telefone, celular, mobile, whatsapp" },
  { field: "E-mail", names: "email, mail" },
  { field: "Aparelho", names: "mac, client_mac, device_mac (guardado só em hash)" },
  { field: "Aceitou receber mensagens", names: "consent, marketing_consent, opt_in, aceite" },
  { field: "Unidade (se o endereço for da rede toda)", names: "unit, unidade, location" },
];
