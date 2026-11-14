import { describe, expect, it, vi } from "vitest";
import {
  b64u, buildPushMessage, deriveVapidKeys, encryptPayload, fromB64u, isAllowedPushEndpoint, sendWebPush, vapidAuthorization,
} from "@/lib/integration/webpush";

const enc = new TextEncoder();
const dec = new TextDecoder();
const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

/** Lado do navegador (RFC 8291 §4): decifra para provar que o corpo gerado é aceito por quem recebe. */
async function decrypt(body: Uint8Array, uaPrivate: CryptoKey, uaPublic: Uint8Array, authSecret: Uint8Array): Promise<Uint8Array> {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey("raw", buf(asPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, uaPrivate, 256));
  const hk = async (ikm: Uint8Array, s: Uint8Array, info: Uint8Array, n: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: buf(s), info: buf(info) }, await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]), n * 8));
  const cat = (...p: Uint8Array[]) => Uint8Array.from(p.flatMap((x) => [...x]));
  const ikm = await hk(ecdh, authSecret, cat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hk(ikm, salt, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hk(ikm, salt, enc.encode("Content-Encoding: nonce\0"), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(nonce) }, await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["decrypt"]), buf(cipher)));
  expect(plain[plain.length - 1]).toBe(0x02); // delimitador do último registro
  return plain.slice(0, -1);
}

async function newSubscriber() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, pub, auth, keys: { p256dh: b64u(pub), auth: b64u(auth) } };
}

describe("chave VAPID derivada", () => {
  it("é a mesma para o mesmo segredo e muda quando o segredo muda", async () => {
    const a = await deriveVapidKeys("segredo-de-teste-aaaaaaaaaaaa");
    const b = await deriveVapidKeys("segredo-de-teste-aaaaaaaaaaaa");
    const c = await deriveVapidKeys("outro-segredo-bbbbbbbbbbbbbbbb");
    expect(a.publicKey).toBe(b.publicKey);
    expect(a.publicKey).not.toBe(c.publicKey);
    const raw = fromB64u(a.publicKey);
    expect(raw.length).toBe(65);
    expect(raw[0]).toBe(0x04);
  });
  it("recusa segredo curto demais", async () => {
    await expect(deriveVapidKeys("curto")).rejects.toThrow("PUSH_SEED_CURTO");
  });
  it("a assinatura do cabeçalho confere com a chave pública", async () => {
    const keys = await deriveVapidKeys("segredo-de-teste-aaaaaaaaaaaa");
    const header = await vapidAuthorization(keys, "https://fcm.googleapis.com/fcm/send/abc", "mailto:a@b.com", 1_800_000_000);
    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header)!;
    expect(m).toBeTruthy();
    expect(JSON.parse(dec.decode(fromB64u(m[2]!)))).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_800_043_200, sub: "mailto:a@b.com" });
    expect(m[4]).toBe(keys.publicKey);
    const pub = await crypto.subtle.importKey("raw", buf(fromB64u(keys.publicKey)), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, buf(fromB64u(m[3]!)), enc.encode(`${m[1]}.${m[2]}`))).toBe(true);
  });
});

describe("criptografia aes128gcm (RFC 8291)", () => {
  it("reproduz o exemplo oficial do apêndice A", async () => {
    const asPublic = fromB64u("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
    const asPriv = fromB64u("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw");
    const jwk = { kty: "EC", crv: "P-256", d: b64u(asPriv), x: b64u(asPublic.slice(1, 33)), y: b64u(asPublic.slice(33)) };
    const asKeyPair = {
      privateKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
      publicKey: await crypto.subtle.importKey("raw", buf(asPublic), { name: "ECDH", namedCurve: "P-256" }, true, []),
    } as CryptoKeyPair;
    const body = await encryptPayload(enc.encode("When I grow up, I want to be a watermelon"), {
      p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg",
    }, { asKeyPair, salt: fromB64u("DGv6ra1nlYgDCS1FRnbzlw") });
    expect(b64u(body)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  it("o navegador consegue decifrar o que o servidor gera", async () => {
    const sub = await newSubscriber();
    const msg = JSON.stringify({ title: "Nova reserva para aprovar", body: "João · 4 pessoas · 14/11 às 12:00 · Goiânia" });
    const body = await encryptPayload(enc.encode(msg), sub.keys);
    expect(dec.decode(await decrypt(body, sub.pair.privateKey, sub.pub, sub.auth))).toBe(msg);
  });

  it("cada envio usa salt e chave efêmera novos", async () => {
    const sub = await newSubscriber();
    const a = await encryptPayload(enc.encode("x"), sub.keys);
    const b = await encryptPayload(enc.encode("x"), sub.keys);
    expect(b64u(a)).not.toBe(b64u(b));
  });

  it("recusa chave pública inválida e mensagem grande demais", async () => {
    const sub = await newSubscriber();
    await expect(encryptPayload(enc.encode("x"), { p256dh: "AAAA", auth: sub.keys.auth })).rejects.toThrow("ASSINATURA_INVALIDA");
    await expect(encryptPayload(new Uint8Array(3001), sub.keys)).rejects.toThrow("PAYLOAD_GRANDE");
  });
});

describe("envio", () => {
  it("aceita só endereços dos serviços de push", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://exemplo.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest")).toBe(false);
  });

  it("manda cabeçalhos certos e interpreta as respostas", async () => {
    const keys = await deriveVapidKeys("segredo-de-teste-aaaaaaaaaaaa");
    const sub = await newSubscriber();
    const target = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...sub.keys };
    const fetcher = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const h = init?.headers as Record<string, string>;
      expect(h["content-encoding"]).toBe("aes128gcm");
      expect(h["authorization"]).toMatch(/^vapid t=/);
      expect(Number(h["ttl"])).toBeGreaterThan(0);
      return new Response(null, { status: 201 });
    });
    expect(await sendWebPush(keys, "mailto:a@b.com", target, { a: 1 }, { fetcher: fetcher as never })).toEqual({ ok: true });

    const status = (s: number) => sendWebPush(keys, "mailto:a@b.com", target, { a: 1 }, { fetcher: (async () => new Response(null, { status: s })) as never });
    expect(await status(410)).toMatchObject({ ok: false, gone: true, retry: false });
    expect(await status(404)).toMatchObject({ ok: false, gone: true });
    expect(await status(429)).toMatchObject({ ok: false, gone: false, retry: true });
    expect(await status(503)).toMatchObject({ ok: false, retry: true });
    expect(await status(401)).toMatchObject({ ok: false, gone: false, retry: false });
    const down = await sendWebPush(keys, "mailto:a@b.com", target, {}, { fetcher: (async () => { throw new Error("rede"); }) as never });
    expect(down).toMatchObject({ ok: false, retry: true, status: 0 });
    expect(await sendWebPush(keys, "mailto:a@b.com", { ...target, endpoint: "https://exemplo.com/x" }, {})).toMatchObject({ ok: false, gone: true });
  });
});

describe("texto do popup", () => {
  it("encurta, limpa espaços e só aceita links do painel", () => {
    const m = buildPushMessage({ id: "1", kind: "reserva_pendente", severity: "info", title: "  Nova   reserva ", body: "a".repeat(400), link: "/admin/aprovacoes" });
    expect(m.title).toBe("Nova reserva");
    expect(m.body.length).toBe(180);
    expect(m.url).toBe("/admin/aprovacoes");
    expect(buildPushMessage({ id: "1", kind: "k", severity: "info", title: "t", body: null, link: "https://evil.com" }).url).toBe("/admin/alertas");
    expect(buildPushMessage({ id: "1", kind: "k", severity: "info", title: "t", body: null, link: null }).body).toBe("");
  });
});
