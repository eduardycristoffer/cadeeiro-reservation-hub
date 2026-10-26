// Web Crypto: funciona no Worker (produção), no navegador e no Node dos testes.
const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** Comparação em tempo constante para strings hex/ASCII. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Assinatura de webhook do Chatwoot:
 *   X-Chatwoot-Signature: sha256=HMAC_SHA256(secret, `${timestamp}.${rawBody}`)
 *   X-Chatwoot-Timestamp: segundos Unix
 * Rejeita timestamps fora da janela de tolerância (replay).
 */
export async function verifyChatwootSignature(opts: {
  secret: string;
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): Promise<boolean> {
  const { secret, rawBody, signature, timestamp } = opts;
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > (opts.toleranceSeconds ?? 300)) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  const given = signature.trim().replace(/^sha256=/i, "").toLowerCase();
  return safeEqual(given, expected);
}
