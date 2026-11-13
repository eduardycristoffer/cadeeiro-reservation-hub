// Link de primeiro acesso. Em vez de mandar o link direto do Supabase (que é consumido por quem
// "pré-visualiza" o e-mail, como o Outlook e antivírus), mandamos um link do próprio painel com o
// token; a pessoa só gasta o token ao abrir a página e o navegador rodar o script.
export const INVITE_TYPES = ["invite", "magiclink", "recovery", "email"] as const;
export type InviteType = (typeof INVITE_TYPES)[number];

const TOKEN_RE = /^[A-Za-z0-9_-]{16,200}$/;

export function buildInviteLink(base: string, tokenHash: string, type: string): string | null {
  if (!TOKEN_RE.test(tokenHash) || !(INVITE_TYPES as readonly string[]).includes(type)) return null;
  try {
    const u = new URL(base);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    return `${u.origin}/primeiro-acesso?token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;
  } catch { return null; }
}

/** Lê `token_hash` e `type` da URL da página de primeiro acesso; devolve null se não houver ou for inválido. */
export function parseInviteParams(search: string): { tokenHash: string; type: InviteType } | null {
  const p = new URLSearchParams(search);
  const tokenHash = p.get("token_hash") ?? "";
  const type = p.get("type") ?? "";
  if (!TOKEN_RE.test(tokenHash) || !(INVITE_TYPES as readonly string[]).includes(type)) return null;
  return { tokenHash, type: type as InviteType };
}
