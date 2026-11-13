/**
 * Pixel da Meta (vários pixels por página) com consentimento LGPD.
 * - Só carrega depois que o visitante aceita os cookies de marketing.
 * - Nunca envia dados pessoais (nome, telefone) nos eventos.
 * - Nunca roda no painel (/admin): quem monta o carregador são só as páginas públicas.
 */

export type PixelEvent = "PageView" | "ViewContent" | "InitiateCheckout" | "Lead" | "Contact" | "Schedule";
export type Consent = "granted" | "denied" | null;

const CONSENT_KEY = "candeeiro:cookies";
const SENT_PREFIX = "candeeiro:pixel-once:";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[][]; loaded?: boolean; version?: string; push?: unknown };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

export const isValidPixelId = (id: string): boolean => /^[0-9]{6,20}$/.test(id);

export function getConsent(): Consent {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch { return null; }
}

export function setConsent(v: Exclude<Consent, null>): void {
  try { window.localStorage.setItem(CONSENT_KEY, v); } catch { /* navegador sem storage: vale só nesta página */ }
  window.dispatchEvent(new Event("candeeiro:consent"));
}

const initialized = new Set<string>();
// eventos disparados antes do pixel terminar de carregar (a lista de pixels vem do banco, de forma assíncrona)
const pending: { event: string; params?: Record<string, string | number> | undefined }[] = [];

/** Injeta o fbevents.js uma vez e inicia cada pixel válido. Devolve quantos pixels foram iniciados agora. */
export function loadPixels(ids: readonly string[]): number {
  if (typeof window === "undefined" || getConsent() !== "granted") return 0;
  const valid = ids.filter(isValidPixelId).filter((id) => !initialized.has(id));
  if (!window.fbq) {
    const q: Fbq = function (...args: unknown[]) { (q.callMethod ? q.callMethod(...args) : q.queue?.push(args)); } as Fbq;
    q.queue = []; q.loaded = true; q.version = "2.0"; q.push = q;
    window.fbq = q; window._fbq = q;
    const s = document.createElement("script");
    s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  }
  for (const id of valid) { window.fbq?.("init", id); initialized.add(id); }
  if (valid.length) window.fbq?.("track", "PageView");
  if (initialized.size) for (const e of pending.splice(0)) window.fbq?.("track", e.event, e.params);
  return valid.length;
}

/** Dispara um evento padrão. `onceKey` evita repetir (ex.: reserva já contada nesta sessão). */
export function track(event: Exclude<PixelEvent, "PageView">, params?: Record<string, string | number>, onceKey?: string): void {
  if (typeof window === "undefined" || getConsent() !== "granted") return;
  if (onceKey) {
    try {
      if (window.sessionStorage.getItem(SENT_PREFIX + onceKey)) return;
      window.sessionStorage.setItem(SENT_PREFIX + onceKey, "1");
    } catch { /* sem sessionStorage: dispara mesmo assim */ }
  }
  if (!window.fbq || !initialized.size) { if (pending.length < 20) pending.push({ event, params }); return; }
  window.fbq("track", event, params);
}
