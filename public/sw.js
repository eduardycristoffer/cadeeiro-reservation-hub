/* Candeeiro Gestão — service worker do app.
 * 1) Abre mesmo sem internet (mostra a tela "sem conexão" em vez do erro do navegador).
 * 2) Guarda só arquivos do próprio app (JS/CSS/ícones). Nunca guarda dados: reservas, clientes e alertas vêm sempre da rede.
 * 3) Mostra os alertas no popup do aparelho (push) e abre a tela certa ao tocar.
 * Para forçar atualização do cache, troque a versão abaixo. */
const VERSION = "v2";
const STATIC_CACHE = `candeeiro-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/badge-96.png", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("candeeiro-") && k !== STATIC_CACHE).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => undefined);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

const isStaticAsset = (url) =>
  url.origin === self.location.origin && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp)$/.test(url.pathname) && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/__"));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // fontes do Google: guarda para abrir rápido depois
  if (url.origin === "https://fonts.gstatic.com" || url.origin === "https://fonts.googleapis.com") {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.origin !== self.location.origin) return; // Supabase e outros serviços: direto na rede
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) return preload;
          return await fetchWithTimeout(req, 8000);
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          return (await cache.match(OFFLINE_URL)) || new Response("Sem conexão", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
        }
      })(),
    );
    return;
  }

  if (isStaticAsset(url)) event.respondWith(staleWhileRevalidate(req));
});

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()).catch(() => undefined); return res; })
    .catch(() => undefined);
  return cached || (await network) || new Response("", { status: 504 });
}

/* ---------------------------------------------------------------- alertas no popup */

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Candeeiro", body: event.data ? event.data.text() : "" }; }
  const title = String(data.title || "Candeeiro");
  const url = typeof data.url === "string" && data.url.startsWith("/admin") ? data.url : "/admin/alertas";
  const urgent = data.severity === "urgente";

  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const focused = wins.find((w) => w.visibilityState === "visible" && w.focused);
      // Safari/iPhone exige um popup para TODO push (senão cancela a assinatura depois de alguns). Lá o popup aparece mesmo
      // com o app aberto e some sozinho em seguida; nos outros navegadores basta o aviso dentro da tela.
      const ua = (self.navigator && self.navigator.userAgent) || "";
      const webkit = /AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/.test(ua);
      if (focused && !webkit) {
        focused.postMessage({ type: "push", data: { ...data, url } });
        return;
      }
      if (self.navigator && "setAppBadge" in self.navigator) await self.navigator.setAppBadge().catch(() => undefined);
      await self.registration.showNotification(title, {
        body: String(data.body || ""),
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: String(data.id || data.kind || "candeeiro"), // o mesmo alerta nunca aparece duas vezes
        renotify: false,
        requireInteraction: urgent,
        vibrate: urgent ? [220, 100, 220, 100, 220] : [160, 80, 160],
        timestamp: Date.now(),
        lang: "pt-BR",
        data: { url },
      });
      if (focused) { // só Safari chega aqui: avisa dentro da tela e recolhe o popup depois de alguns segundos
        focused.postMessage({ type: "push", data: { ...data, url } });
        const tag = String(data.id || data.kind || "candeeiro");
        await new Promise((r) => setTimeout(r, 6000));
        const open = await self.registration.getNotifications({ tag });
        open.forEach((n) => n.close());
        return;
      }
      wins.forEach((w) => w.postMessage({ type: "push", data: { ...data, url }, silent: true }));
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/admin/alertas";
  const target = new URL(raw, self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin && new URL(w.url).pathname.startsWith("/admin")) || wins[0];
      if (open) {
        await open.focus().catch(() => undefined);
        open.postMessage({ type: "navigate", url: target.pathname + target.search });
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});

// o serviço de push trocou a assinatura: avisa o app aberto para registrar a nova (sem login, o worker não consegue sozinho)
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => wins.forEach((w) => w.postMessage({ type: "resubscribe" }))),
  );
});
