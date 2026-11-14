// Leitura do corpo que o sistema de Wi-Fi manda: JSON, formulário (a=1&b=2) ou parâmetros na URL.
export const HOOK_MAX_BYTES = 32 * 1024;
export const HOOK_TOKEN_RE = /^whk_[0-9a-f]{40}$/;

const formToObject = (params: URLSearchParams): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of params) if (k && k.length <= 80) out[k] = v;
  return out;
};

/** Devolve o conteúdo interpretado ou `undefined` quando não dá para entender (o servidor responde 400). */
export function parseHookBody(contentType: string | null, text: string): unknown {
  const ct = (contentType ?? "").toLowerCase();
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (ct.includes("application/x-www-form-urlencoded") || (!ct.includes("json") && !/^[[{"]/.test(trimmed) && trimmed.includes("="))) {
    return formToObject(new URLSearchParams(trimmed));
  }
  try { return JSON.parse(trimmed); } catch { return undefined; }
}

/** Tamanho em bytes do texto (UTF-8) — o limite vale para o que realmente chegou, não só o cabeçalho. */
export const byteLength = (s: string) => new TextEncoder().encode(s).length;

export function queryToPayload(url: URL): Record<string, string> {
  return formToObject(url.searchParams);
}
