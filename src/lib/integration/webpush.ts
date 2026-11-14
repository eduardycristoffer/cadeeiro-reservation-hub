// Alertas no popup (Web Push) sem biblioteca: VAPID (RFC 8292) + criptografia aes128gcm (RFC 8291) só com Web Crypto,
// que existe no Worker (produção), no navegador e no Node dos testes.
//
// A chave VAPID do app é DERIVADA de um segredo que o servidor já tem (HKDF), então não há chave nova para guardar nem
// colar em lugar nenhum. Trocar o segredo troca a chave: os aparelhos simplesmente reativam os alertas ao abrir o app.
const enc = new TextEncoder();

export function b64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64u(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

// ---------------------------------------------------------------------------------------------------------------------
// Chave VAPID

export type VapidKeys = { publicKey: string; privateKey: CryptoKey };

// PKCS#8 de uma chave privada P-256 SEM a chave pública embutida (o motor calcula a pública ao importar).
const PKCS8_P256_PREFIX = Uint8Array.from([
  0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48,
  0xce, 0x3d, 0x03, 0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20,
]);

const cache = new Map<string, Promise<VapidKeys>>();

/** Mesma entrada, mesma chave: o servidor, em qualquer instância, chega à mesma chave pública. */
export function deriveVapidKeys(seed: string): Promise<VapidKeys> {
  let p = cache.get(seed);
  if (!p) {
    p = derive(seed);
    cache.set(seed, p);
    p.catch(() => cache.delete(seed));
  }
  return p;
}

async function derive(seed: string): Promise<VapidKeys> {
  if (seed.length < 16) throw new Error("PUSH_SEED_CURTO");
  const ikm = await crypto.subtle.importKey("raw", enc.encode(seed), "HKDF", false, ["deriveBits"]);
  // um escalar fora da faixa da curva é raríssimo; se acontecer, a próxima rodada resolve
  for (let i = 0; i < 8; i++) {
    const bits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: enc.encode("candeeiro-webpush-v1"), info: enc.encode(`vapid-p256-${i}`) }, ikm, 256);
    try {
      const privateKey = await crypto.subtle.importKey("pkcs8", buf(concat(PKCS8_P256_PREFIX, new Uint8Array(bits))), { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
      const jwk = await crypto.subtle.exportKey("jwk", privateKey);
      if (!jwk.x || !jwk.y) throw new Error("sem ponto público");
      return { publicKey: b64u(concat(Uint8Array.of(0x04), fromB64u(jwk.x), fromB64u(jwk.y))), privateKey };
    } catch { /* tenta a próxima rodada */ }
  }
  throw new Error("PUSH_CHAVE_INVALIDA");
}

/** Cabeçalho Authorization (VAPID) para um endpoint de push. */
export async function vapidAuthorization(keys: VapidKeys, endpoint: string, subject: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: nowSeconds + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.publicKey}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Criptografia da mensagem (RFC 8291, aes128gcm)

export type PushKeys = { p256dh: string; auth: string };
export type EncryptOverrides = { asKeyPair?: CryptoKeyPair; salt?: Uint8Array };

/** Corpo cifrado pronto para o POST (cabeçalho com salt + chave efêmera + texto cifrado). */
export async function encryptPayload(payload: Uint8Array, sub: PushKeys, o: EncryptOverrides = {}): Promise<Uint8Array> {
  const uaPublic = fromB64u(sub.p256dh);
  const authSecret = fromB64u(sub.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04 || authSecret.length < 16) throw new Error("ASSINATURA_INVALIDA");
  if (payload.length > 3000) throw new Error("PAYLOAD_GRANDE");

  const uaKey = await crypto.subtle.importKey("raw", buf(uaPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const asPair = o.asKeyPair ?? (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asPair.publicKey));
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPair.privateKey, 256));

  const hkdf = async (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, bytes: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(info) },
      await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]), bytes * 8));

  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(ecdh, authSecret, keyInfo, 32);
  const salt = o.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, enc.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(nonce) }, aes, buf(concat(payload, Uint8Array.of(0x02)))));
  const header = concat(salt, Uint8Array.of(0, 0, 0x10, 0), Uint8Array.of(asPublic.length), asPublic); // record size 4096
  return concat(header, cipher);
}

// ---------------------------------------------------------------------------------------------------------------------
// Envio

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushResult = { ok: true } | { ok: false; gone: boolean; retry: boolean; status: number; error: string };

/** Só aceita endereços https dos serviços de push (nunca um endereço qualquer que alguém cadastre). */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
    const h = u.hostname.toLowerCase();
    return (
      h === "fcm.googleapis.com" || h === "android.googleapis.com" ||
      h.endsWith(".push.apple.com") || h === "push.apple.com" ||
      h.endsWith(".push.services.mozilla.com") || h === "updates.push.services.mozilla.com" ||
      h.endsWith(".notify.windows.com")
    );
  } catch { return false; }
}

export async function sendWebPush(
  keys: VapidKeys, subject: string, target: PushTarget, message: unknown,
  opts: { ttl?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string; fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<PushResult> {
  if (!isAllowedPushEndpoint(target.endpoint)) return { ok: false, gone: true, retry: false, status: 0, error: "endpoint não permitido" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10000);
  try {
    const body = await encryptPayload(enc.encode(JSON.stringify(message)), target);
    const headers: Record<string, string> = {
      authorization: await vapidAuthorization(keys, target.endpoint, subject),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(opts.ttl ?? 6 * 3600),
      urgency: opts.urgency ?? "high",
    };
    if (opts.topic && /^[A-Za-z0-9_-]{1,32}$/.test(opts.topic)) headers["topic"] = opts.topic;
    const res = await (opts.fetcher ?? fetch)(target.endpoint, { method: "POST", headers, body: buf(body), signal: ctl.signal });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    const gone = res.status === 404 || res.status === 410;
    // 400/401/403 = chave recusada pelo serviço: não adianta repetir
    return { ok: false, gone, retry: !gone && (res.status === 429 || res.status >= 500), status: res.status, error: `push ${res.status}` };
  } catch (e) {
    const timeout = e instanceof Error && e.name === "AbortError";
    return { ok: false, gone: false, retry: true, status: 0, error: timeout ? "push: tempo esgotado" : "push: sem conexão" };
  } finally {
    clearTimeout(timer);
  }
}

/** Texto do popup: curto o bastante para qualquer aparelho e sem quebras estranhas. */
export function buildPushMessage(n: { id: string; title: string; body: string | null; link: string | null; severity: string; kind: string }) {
  const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
  return {
    v: 1, id: n.id, kind: n.kind, severity: n.severity,
    title: clip(n.title.replace(/\s+/g, " ").trim(), 80),
    body: clip((n.body ?? "").replace(/\s+/g, " ").trim(), 180),
    url: n.link && /^\/admin(\/[a-z0-9-]+)?$/.test(n.link) ? n.link : "/admin/alertas",
  };
}
