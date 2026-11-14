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
  INVALID_EMAIL: "Esse e-mail não parece válido. Confira e tente de novo.",
  INVALID_NAME: "Informe seu nome completo.",
  INVALID_PARTY_SIZE: "Quantidade de pessoas inválida.",
  PRIVACY_REQUIRED: "É preciso aceitar o aviso de privacidade.",
  RATE_LIMITED: "Muitas tentativas em pouco tempo. Aguarde alguns minutos.",
  INVALID_SERVICE: "Escolha o serviço para continuar.",
  SERVICE_NOT_OFFERED: "Esta unidade não oferece esse serviço. Volte e escolha outra unidade.",
  INVALID_OCCASION: "Ocasião inválida. Escolha uma das opções.",
  INVALID_CELEBRANT: "O nome de quem está comemorando pode ter até 60 caracteres.",
  NOTES_TOO_LONG: "A observação pode ter no máximo 500 caracteres.",
  SPAM_DETECTED: "Não foi possível enviar. Tente novamente.",
  FORBIDDEN: "Você não tem permissão para esta ação.",
  PHONE_EXISTS: "Já existe um contato com esse telefone nesta loja.",
  SLUG_EXISTS: "Já existe uma loja com esse nome. Escolha outro.",
  TOO_MANY_ROWS: "Máximo de 5.000 linhas por importação.",
  INVALID_KIND: "Tipo de alerta inválido.",
  INVALID_NOTES: "A observação pode ter no máximo 1.000 caracteres.",
  INVALID_TRANSITION: "Essa mudança de status não é permitida a partir do status atual.",
  REASON_REQUIRED: "Informe o motivo do cancelamento.",
  LARGE_GROUP_NEEDS_MANAGER: "Grupos grandes só podem ser confirmados por admin.",
  NOTE_REQUIRED: "Escreva a observação antes de salvar.",
  INVALID_CITY: "Escolha Goiânia ou Anápolis.",
  INVALID_MESSAGE: "A mensagem precisa ter entre 10 e 300 caracteres.",
  INVALID_TICKET: "O ticket médio deve estar entre 0 e 1000.",
  INVALID_STATUS: "Status inválido.",
  NOT_FOUND: "Registro não encontrado.",
  INVALID_DATE: "Data fora do intervalo permitido.",
  INVALID_AMOUNT: "Informe um valor válido (zero ou mais).",
  INVALID_CAMPAIGN: "Nome de campanha inválido. Use letras minúsculas, números e hífen.",
  INVALID_SLUG: "O endereço da página deve ter de 3 a 60 caracteres: letras minúsculas, números e hífen.",
  DUPLICATE_SLUG: "Já existe uma página com esse endereço. Escolha outro.",
  EMPTY_IMPORT: "O arquivo não tem nenhuma linha para importar.",
  IMPORT_TOO_LARGE: "Máximo de 500 linhas por importação.",
  INVALID_SETTINGS: "Confira os valores: horário final depois do inicial, limites dentro do permitido e endereço do site começando com https://.",
  INVALID_TEMPLATE_BODY: "A mensagem precisa ter entre 10 e 800 caracteres e só pode usar variáveis da lista, como {{nome}}.",
  INVALID_TEMPLATE: "Modelo de mensagem desconhecido.",
  INVALID_AUDIENCE: "Escolha para quem enviar.",
  EMPTY_AUDIENCE: "Ninguém se encaixa nesse público agora (ou já recebeu mensagem recentemente).",
  TOO_MANY: "Esse público passa de 500 pessoas. Escolha uma unidade ou reduza o filtro.",
  UNIT_REQUIRED: "Escolha a unidade antes de continuar.",
  INVALID_REVIEW_URL: "O link de avaliação precisa ser do Google (g.page, search.google.com, maps.app.goo.gl ou share.google) e começar com https://",
  INVALID_DAYS: "Escolha entre 1 e 90 dias.",
  MISSING_REVIEW_LINK: "A mensagem precisa ter o {{link_avaliacao}}, senão o cliente não recebe o link.",
  DUPLICATE_PIXEL: "Esse pixel já está cadastrado com o mesmo escopo.",
  CAMPAIGN_REQUIRED: "Informe a campanha para um pixel de campanha.",
  SUPABASE_NOT_CONFIGURED: "O sistema ainda está sendo configurado. Tente novamente em breve.",
};

export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  for (const k of Object.keys(ERRORS)) if (msg.includes(k)) return ERRORS[k]!;
  return "Algo deu errado. Tente novamente.";
}
