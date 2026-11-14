// O app no navegador: instalação, service worker, alertas no popup e selo no ícone.
// Tudo aqui é seguro de importar no servidor (SSR): o que depende do navegador só roda dentro de efeitos e eventos.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { deviceLabel, installPlan, parseUserAgent, pushSupport, type Env, type InstallPlan, type PermissionView, type PushSupport } from "@/lib/app";
import { fromB64u, b64u } from "@/lib/integration/webpush";
import { getPushConfig } from "@/lib/push.functions";
import { friendlyError, supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------------------------------------------------
// Instalação

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Snap = { canPrompt: boolean; installedNow: boolean };

let deferred: InstallEvent | null = null;
let snap: Snap = { canPrompt: false, installedNow: false };
const listeners = new Set<() => void>();
const emit = () => { snap = { canPrompt: deferred !== null, installedNow: snap.installedNow }; listeners.forEach((l) => l()); };
let started = false;

export const PUSH_WANTED_KEY = "candeeiro.push.wanted";
const lsGet = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch { /* sem armazenamento: segue */ } };

/** Pode registrar o service worker aqui? Não na prévia do editor nem em janela embutida (cache velho atrapalha quem está editando). */
export function swAllowed(): boolean {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) return false;
  if (!import.meta.env.PROD) return false;
  try { if (window.self !== window.top) return false; } catch { return false; }
  return !/^id-preview--|\.lovableproject\.com$/.test(window.location.hostname);
}

/** Liga o app: registra o service worker e escuta o convite de instalação. Chamar uma vez, na raiz. */
export function startApp(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; emit(); });
  window.addEventListener("appinstalled", () => { deferred = null; snap = { ...snap, installedNow: true }; emit(); });
  if (swAllowed()) {
    const reg = () => { void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined); };
    if (document.readyState === "complete") reg(); else window.addEventListener("load", reg, { once: true });
  }
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnap = () => snap;
const SERVER_SNAP: Snap = { canPrompt: false, installedNow: false };
const getServerSnap = (): Snap => SERVER_SNAP;

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mm = (q: string) => window.matchMedia?.(q).matches ?? false;
  return mm("(display-mode: standalone)") || mm("(display-mode: window-controls-overlay)") || mm("(display-mode: minimal-ui)")
    || (navigator as Navigator & { standalone?: boolean }).standalone === true || document.referrer.startsWith("android-app://");
}

/** Aparelho + navegador + se já está rodando como app. `null` enquanto a tela ainda não montou. */
export function useAppEnv(): { env: Env; standalone: boolean } | null {
  const [v, setV] = useState<{ env: Env; standalone: boolean } | null>(null);
  useEffect(() => {
    const read = () => setV({ env: parseUserAgent(navigator.userAgent, navigator.maxTouchPoints), standalone: isStandalone() });
    read();
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", read);
    return () => mq?.removeEventListener?.("change", read);
  }, []);
  return v;
}

export type InstallState = { ready: boolean; env: Env | null; standalone: boolean; plan: InstallPlan | null; install: () => Promise<"accepted" | "dismissed" | "unavailable"> };

export function useInstall(): InstallState {
  const base = useAppEnv();
  const s = useSyncExternalStore(subscribe, getSnap, getServerSnap);
  const standalone = (base?.standalone ?? false) || s.installedNow;
  const plan = base ? installPlan(base.env, { standalone, canPrompt: s.canPrompt }) : null;
  const install = useCallback(async () => {
    const ev = deferred;
    if (!ev) return "unavailable" as const;
    deferred = null; emit();
    try { await ev.prompt(); return (await ev.userChoice).outcome; } catch { return "unavailable" as const; }
  }, []);
  return { ready: base !== null, env: base?.env ?? null, standalone, plan, install };
}

// ---------------------------------------------------------------------------------------------------------------------
// Alertas no popup

async function currentRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing?.active) return existing;
    return await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
  } catch { return null; }
}

const sameKey = (sub: PushSubscription, publicKey: string) => {
  const k = sub.options?.applicationServerKey;
  return !!k && b64u(new Uint8Array(k as ArrayBuffer)) === publicKey;
};

export type PushResultErr = "denied" | "unsupported" | "no-worker" | "server" | "db" | "dismissed";
export type PushResult = { ok: true } | { ok: false; error: PushResultErr; message?: string };

/** Cria (ou renova) a assinatura deste aparelho e registra no banco. Precisa da permissão já concedida. */
async function ensureSubscription(label: string): Promise<PushResult> {
  const reg = await currentRegistration();
  if (!reg) return { ok: false, error: "no-worker" };
  const cfg = await getPushConfig().catch(() => null);
  const key = cfg?.publicKey;
  if (!key) return { ok: false, error: "server" };
  let sub = await reg.pushManager.getSubscription();
  let created = false;
  if (sub && !sameKey(sub, key)) { await sub.unsubscribe().catch(() => undefined); sub = null; }
  if (!sub) {
    try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) as BufferSource }); created = true; }
    catch { return { ok: false, error: "unsupported" }; }
  }
  const j = sub.toJSON();
  const p256dh = j.keys?.["p256dh"]; const authKey = j.keys?.["auth"];
  if (!j.endpoint || !p256dh || !authKey || !supabase) return { ok: false, error: "unsupported" };
  const { error } = await supabase.rpc("push_subscribe" as never, { _endpoint: j.endpoint, _p256dh: p256dh, _auth: authKey, _label: label, _ua: navigator.userAgent.slice(0, 300) } as never);
  if (error) { if (created) await sub.unsubscribe().catch(() => undefined); return { ok: false, error: "db", message: friendlyError(error) }; }
  return { ok: true };
}

export type PushState = {
  ready: boolean;
  support: PushSupport | null;
  permission: PermissionView;
  /** Este aparelho está ligado (assinatura no navegador e no banco). `null` = verificando. */
  on: boolean | null;
  busy: boolean;
  enable: () => Promise<PushResult>;
  disable: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function usePush(): PushState {
  const base = useAppEnv();
  const [permission, setPermission] = useState<PermissionView>("default");
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof Notification === "undefined") { setPermission("unsupported"); setOn(false); return; }
    setPermission(Notification.permission as PermissionView);
    const reg = await currentRegistration();
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    setOn(Notification.permission === "granted" && !!sub && lsGet(PUSH_WANTED_KEY) === "1");
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const support = base ? pushSupport(base.env, { standalone: base.standalone, hasPush: typeof window !== "undefined" && "PushManager" in window, hasNotification: typeof Notification !== "undefined", hasServiceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator }) : null;

  const enable = useCallback(async (): Promise<PushResult> => {
    if (!base || typeof Notification === "undefined") return { ok: false, error: "unsupported" };
    setBusy(true);
    try {
      const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      setPermission(perm as PermissionView);
      if (perm !== "granted") return { ok: false, error: perm === "denied" ? "denied" : "dismissed" };
      const r = await ensureSubscription(deviceLabel(base.env, base.standalone));
      if (r.ok) lsSet(PUSH_WANTED_KEY, "1");
      await refresh();
      return r;
    } finally { setBusy(false); }
  }, [base, refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      lsSet(PUSH_WANTED_KEY, null);
      const reg = await currentRegistration();
      const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
      if (sub) {
        if (supabase) await supabase.rpc("push_unsubscribe" as never, { _endpoint: sub.endpoint } as never);
        await sub.unsubscribe().catch(() => undefined);
      }
      await refresh();
    } finally { setBusy(false); }
  }, [refresh]);

  return { ready: base !== null, support, permission, on, busy, enable, disable, refresh };
}

/** Ao abrir o painel: renova o aparelho no banco (e na troca de chave do servidor). Sem pedir nada à pessoa. */
export async function syncPushOnOpen(): Promise<void> {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || lsGet(PUSH_WANTED_KEY) !== "1") return;
    const last = Number(lsGet("candeeiro.push.synced") ?? 0);
    if (Date.now() - last < 6 * 3600_000) return;
    const env = parseUserAgent(navigator.userAgent, navigator.maxTouchPoints);
    const r = await ensureSubscription(deviceLabel(env, isStandalone()));
    if (r.ok) lsSet("candeeiro.push.synced", String(Date.now()));
  } catch { /* alertas são um extra: nunca derrubam a tela */ }
}

/** Ao sair da conta: este aparelho para de receber os alertas dessa pessoa (a assinatura do navegador fica para o próximo login). */
export async function pushOnSignOut(): Promise<void> {
  try {
    if (!supabase || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await supabase.rpc("push_unsubscribe" as never, { _endpoint: sub.endpoint } as never);
    lsSet("candeeiro.push.synced", null);
  } catch { /* segue */ }
}

// ---------------------------------------------------------------------------------------------------------------------
// Selo no ícone do app (número de alertas não lidos)

export function setAppBadge(n: number | null): void {
  try {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!n || n <= 0) void nav.clearAppBadge?.().catch(() => undefined);
    else void nav.setAppBadge?.(n).catch(() => undefined);
  } catch { /* sem suporte */ }
}

/** Busca versão nova do app, aplica e recarrega. */
export async function updateApp(): Promise<"unavailable" | "reloading"> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return "unavailable";
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return "unavailable";
  await reg.update().catch(() => undefined);
  reg.waiting?.postMessage({ type: "SKIP_WAITING" });
  window.location.reload();
  return "reloading";
}
