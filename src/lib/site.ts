// Endereço público do sistema. Hospedagem técnica (lovable.app, supabase.co, pré-visualização) nunca aparece
// em e-mail, convite ou notificação: tudo sai com o domínio da Rede Candeeiro.
export const SITE_URL = "https://candeeiro.tryade.com.br";

const TECHNICAL_HOST = /(^|\.)(lovable\.app|lovableproject(-dev)?\.com|lovable\.dev|supabase\.co|supabase\.in|gpt-eng\.com)$|^id-preview--/i;

/** Origem a usar nos links. Se vier um endereço técnico, volta para o domínio oficial. */
export function publicOrigin(origin?: string | null): string {
  const raw = origin?.trim();
  if (!raw) return SITE_URL;
  try {
    const u = new URL(raw);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (local) return u.origin;
    if (u.protocol !== "https:" || TECHNICAL_HOST.test(u.hostname)) return SITE_URL;
    return u.origin;
  } catch { return SITE_URL; }
}
