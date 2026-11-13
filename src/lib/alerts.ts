// Alertas do painel (sino + e-mail). Lógica pura: lê o que o banco devolve e prepara o que a tela mostra.
import { ALERT_KINDS, parseEmailList, type AlertKind } from "@/lib/email";

export type Severity = "info" | "atencao" | "urgente";
export type Notif = { id: string; kind: AlertKind; severity: Severity; title: string; body: string | null; link: string | null; created_at: string; read: boolean };

const KIND_IDS: readonly string[] = ALERT_KINDS.map((k) => k.id);
const SEVERITIES: readonly string[] = ["info", "atencao", "urgente"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_RE = /^\/admin(\/[a-z0-9-]+)?$/;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Lê as linhas de `notifications`; ignora linhas inválidas e marca as que a pessoa já leu. */
export function parseNotifications(rows: unknown, readIds: Iterable<string>): Notif[] {
  if (!Array.isArray(rows)) return [];
  const read = new Set(readIds);
  const out: Notif[] = [];
  for (const r of rows) {
    if (!isObj(r)) continue;
    const id = str(r["id"]); const kind = str(r["kind"]); const title = str(r["title"]); const created = str(r["created_at"]);
    if (!id || !UUID_RE.test(id) || !kind || !KIND_IDS.includes(kind) || !title || !created || !Number.isFinite(Date.parse(created))) continue;
    const sev = str(r["severity"]);
    const link = str(r["link"]);
    out.push({
      id, kind: kind as AlertKind, severity: sev && SEVERITIES.includes(sev) ? (sev as Severity) : "info", title,
      body: str(r["body"]), link: link && LINK_RE.test(link) ? link : null, created_at: created, read: read.has(id),
    });
  }
  return out.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** Agrupa por dia ("Hoje", "Ontem", "12/11") mantendo a ordem. */
export function groupByDay(list: Notif[], now: Date = new Date()): { label: string; items: Notif[] }[] {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = day(now);
  const groups: { label: string; items: Notif[] }[] = [];
  for (const n of list) {
    const d = new Date(n.created_at);
    const diff = Math.round((today - day(d)) / 86400000);
    const label = diff <= 0 ? "Hoje" : diff === 1 ? "Ontem" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n); else groups.push({ label, items: [n] });
  }
  return groups;
}

export type EmailSettings = {
  email_enabled: boolean;
  email_kinds: Record<AlertKind, boolean>;
  extra_emails: string[];
  queue: { pending: number; sent_7d: number; failed_7d: number; last_error: string | null };
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function parseEmailSettings(raw: unknown): EmailSettings | null {
  if (!isObj(raw)) return null;
  const kindsRaw = isObj(raw["email_kinds"]) ? raw["email_kinds"] : {};
  const email_kinds = Object.fromEntries(ALERT_KINDS.map((k) => [k.id, typeof kindsRaw[k.id] === "boolean" ? kindsRaw[k.id] : k.id !== "lead_whatsapp"])) as Record<AlertKind, boolean>;
  const extra = Array.isArray(raw["extra_emails"]) ? raw["extra_emails"].filter((e): e is string => typeof e === "string") : [];
  const q = isObj(raw["queue"]) ? raw["queue"] : {};
  return {
    email_enabled: raw["email_enabled"] !== false, email_kinds, extra_emails: extra,
    queue: { pending: num(q["pending"]), sent_7d: num(q["sent_7d"]), failed_7d: num(q["failed_7d"]), last_error: str(q["last_error"]) },
  };
}

/** Monta o que `notification_settings_save` espera, ou diz qual campo está errado. */
export function settingsPayload(s: { email_enabled: boolean; email_kinds: Record<AlertKind, boolean>; extraText: string }):
  { ok: true; payload: { email_enabled: boolean; email_kinds: Record<AlertKind, boolean>; extra_emails: string[] } } | { ok: false; error: "INVALID_EMAIL" | "TOO_MANY" } {
  const { emails, invalid } = parseEmailList(s.extraText);
  if (invalid.length) return { ok: false, error: "INVALID_EMAIL" };
  if (emails.length > 10) return { ok: false, error: "TOO_MANY" };
  return { ok: true, payload: { email_enabled: s.email_enabled, email_kinds: s.email_kinds, extra_emails: emails } };
}

export const SEVERITY_DOT: Record<Severity, string> = { info: "bg-muted-foreground/50", atencao: "bg-amber-500", urgente: "bg-red-500" };
