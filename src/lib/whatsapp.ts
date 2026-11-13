/** Lógica pura do botão flutuante de WhatsApp (testada em src/test/whatsapp.test.ts). */

export type WaCity = "goiania" | "anapolis";

/** Link wa.me com o texto já preenchido. Só dígitos no número; sem número devolve null. */
export function buildWaUrl(number: string | null | undefined, message: string): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 13) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/** Pega só parâmetros de campanha conhecidos (e a presença de fbclid/gclid) da URL; valores curtos e limpos. */
export function pickUtm(search: string): Record<string, string> | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = params.get(k)?.trim().slice(0, 80);
    if (v) out[k] = v;
  }
  if (params.get("fbclid")) out["fbclid"] = "1";
  if (params.get("gclid")) out["gclid"] = "1";
  return Object.keys(out).length ? out : null;
}

export type WaLeadResult = { lead_id: string; whatsapp: string | null; message: string; unit_name: string | null };

/** Resposta da RPC capture_whatsapp_lead -> forma segura para a tela. */
export function parseWaLeadResult(data: unknown): WaLeadResult | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d["lead_id"] !== "string") return null;
  return {
    lead_id: d["lead_id"],
    whatsapp: typeof d["whatsapp"] === "string" && d["whatsapp"] ? d["whatsapp"] : null,
    message: typeof d["message"] === "string" ? d["message"] : "",
    unit_name: typeof d["unit_name"] === "string" ? d["unit_name"] : null,
  };
}
