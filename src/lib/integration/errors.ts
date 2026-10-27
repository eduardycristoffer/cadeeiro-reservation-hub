// Erros padronizados da API do SDR: {ok:false, error:{code, message}}.
// message em português claro para o SDR repassar ao cliente quando fizer sentido.

export const API_ERRORS: Record<string, { status: number; message: string }> = {
  UNAUTHORIZED: { status: 401, message: "Chave de API ausente ou inválida." },
  FORBIDDEN_SCOPE: { status: 403, message: "Esta chave de API não tem permissão para esta operação." },
  RATE_LIMITED: { status: 429, message: "Muitas requisições em pouco tempo. Aguarde alguns minutos e tente de novo." },
  VALIDATION_ERROR: { status: 422, message: "Alguns dados enviados estão incompletos ou em formato inválido." },
  INVALID_PHONE: { status: 422, message: "Não consegui validar o telefone. Peça o número com DDD." },
  INVALID_NAME: { status: 422, message: "Preciso do nome completo do cliente." },
  INVALID_PARTY_SIZE: { status: 422, message: "Quantidade de pessoas inválida." },
  NOTES_TOO_LONG: { status: 422, message: "O texto enviado é longo demais (máximo de 500 caracteres)." },
  DESCRIPTION_TOO_LONG: { status: 422, message: "A descrição é longa demais (máximo de 2000 caracteres)." },
  INVALID_SUBJECT: { status: 422, message: "Informe um assunto curto para o atendimento." },
  SUMMARY_TOO_LONG: { status: 422, message: "O resumo pode ter no máximo 500 caracteres." },
  REASON_REQUIRED: { status: 422, message: "Preciso do motivo do cancelamento." },
  NOTHING_TO_CHANGE: { status: 422, message: "Os dados informados são iguais aos da reserva atual." },
  UNIT_UNAVAILABLE: { status: 404, message: "Esta unidade não está aceitando reservas no momento." },
  DELIVERY_UNAVAILABLE: { status: 409, message: "Esta unidade não faz delivery." },
  INVALID_SERVICE: { status: 422, message: "Serviço inválido. Use rodizio_carnes, rodizio_pizza, almoco_quilo ou almoco_executivo." },
  INVALID_OCCASION: { status: 422, message: "Ocasião inválida." },
  INVALID_CELEBRANT: { status: 422, message: "O nome de quem está comemorando pode ter até 60 caracteres." },
  UNIT_NOT_FOUND: { status: 404, message: "Não encontrei essa unidade." },
  SLOT_UNAVAILABLE: { status: 409, message: "Esse horário não tem vaga para essa quantidade de pessoas. Consulte outros horários disponíveis." },
  RESERVATION_NOT_FOUND: { status: 404, message: "Não encontrei reserva com esse protocolo para este telefone." },
  SAC_NOT_FOUND: { status: 404, message: "Não encontrei atendimento com esse protocolo." },
  INVALID_TRANSITION: { status: 409, message: "Essa reserva não pode mais ser alterada ou cancelada pelo WhatsApp." },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "Esta Idempotency-Key já foi usada com outros dados." },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, message: "Uma requisição com esta Idempotency-Key ainda está em processamento." },
  NOT_FOUND: { status: 404, message: "Recurso não encontrado." },
  INTERNAL_ERROR: { status: 500, message: "Erro interno. Tente novamente em instantes." },
};

export class ApiError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? API_ERRORS[code]?.message ?? code);
  }
}

/** Converte erro do banco (raise exception 'CODIGO') em código da API. */
export function codeFromDbError(err: unknown): string {
  const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
  for (const k of Object.keys(API_ERRORS)) if (msg.includes(k)) return k;
  return "INTERNAL_ERROR";
}

export function errorBody(code: string, message?: string) {
  return { ok: false as const, error: { code, message: message ?? API_ERRORS[code]?.message ?? API_ERRORS["INTERNAL_ERROR"]!.message } };
}
