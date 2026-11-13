import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const key = (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? import.meta.env["VITE_SUPABASE_ANON_KEY"]) as
  | string
  | undefined;

export const isSupabaseConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: typeof window !== "undefined",
        autoRefreshToken: true,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  return supabase;
}

const ERRORS: Record<string, string> = {
  SLOT_UNAVAILABLE: "Esse horário acabou de ser preenchido. Escolha outro, por favor.",
  UNIT_UNAVAILABLE: "Esta unidade não está aceitando reservas online no momento.",
  INVALID_PHONE: "Confira o número de WhatsApp (DDD + número).",
  INVALID_NAME: "Informe seu nome completo.",
  INVALID_PARTY_SIZE: "Quantidade de pessoas inválida.",
  PRIVACY_REQUIRED: "É preciso aceitar o aviso de privacidade.",
  RATE_LIMITED: "Muitas tentativas em pouco tempo. Aguarde alguns minutos.",
  INVALID_SERVICE: "Escolha o rodízio para continuar.",
  SERVICE_NOT_OFFERED: "Esta unidade não oferece esse rodízio. Volte e escolha outra unidade.",
  INVALID_OCCASION: "Ocasião inválida. Escolha uma das opções.",
  INVALID_CELEBRANT: "O nome de quem está comemorando pode ter até 60 caracteres.",
  NOTES_TOO_LONG: "A observação pode ter no máximo 500 caracteres.",
  SPAM_DETECTED: "Não foi possível enviar. Tente novamente.",
  FORBIDDEN: "Você não tem permissão para esta ação.",
  INVALID_TRANSITION: "Essa mudança de status não é permitida a partir do status atual.",
  REASON_REQUIRED: "Informe o motivo do cancelamento.",
  LARGE_GROUP_NEEDS_MANAGER: "Grupos grandes só podem ser confirmados por gestor ou super admin.",
  NOTE_REQUIRED: "Escreva a observação antes de salvar.",
  INVALID_CITY: "Escolha Goiânia ou Anápolis.",
  INVALID_MESSAGE: "A mensagem precisa ter entre 10 e 300 caracteres.",
  INVALID_STATUS: "Status inválido.",
  NOT_FOUND: "Registro não encontrado.",
  DUPLICATE_PIXEL: "Esse pixel já está cadastrado com o mesmo escopo.",
  CAMPAIGN_REQUIRED: "Informe a campanha para um pixel de campanha.",
  SUPABASE_NOT_CONFIGURED: "O sistema ainda está sendo configurado. Tente novamente em breve.",
};

export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  for (const k of Object.keys(ERRORS)) if (msg.includes(k)) return ERRORS[k]!;
  return "Algo deu errado. Tente novamente.";
}
