/** Espelha public.normalize_br_phone: devolve "55DDDNUMERO" ou null. */
export function normalizeBrPhone(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^55[1-9][0-9](9[0-9]{8}|[2-8][0-9]{7})$/.test(d) ? d : null;
}

/**
 * Extrai o telefone de um contato do Chatwoot.
 * Ordem: phone_number ("+5511..."), identifier do WhatsApp ("5511...@s.whatsapp.net"),
 * source_id do contact_inbox ("5511...").
 */
export function extractChatwootPhone(c: {
  phone_number?: string | null;
  identifier?: string | null;
  source_id?: string | null;
} | null | undefined): string | null {
  if (!c) return null;
  for (const v of [c.phone_number, c.identifier, c.source_id]) {
    if (!v) continue;
    const local = String(v).split("@")[0] ?? "";
    const n = normalizeBrPhone(local);
    if (n) return n;
  }
  return null;
}

/** Mascara telefone para logs: mantém só os 4 últimos dígitos. */
export function maskPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  return d.length <= 4 ? "****" : `${"*".repeat(d.length - 4)}${d.slice(-4)}`;
}
