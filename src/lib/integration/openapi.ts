import { CLASSIFICATIONS, SAC_CATEGORIES, SAC_PRIORITIES } from "./sdr-schemas";
import { API_ERRORS } from "./errors";

const err = { $ref: "#/components/responses/Error" };
const okEnvelope = (data: object) => ({
  type: "object",
  properties: { ok: { type: "boolean", example: true }, data, mensagem_sugerida: { type: "string" } },
});
const jsonBody = (schema: object) => ({ required: true, content: { "application/json": { schema } } });
const resp = (desc: string, data: object) => ({ description: desc, content: { "application/json": { schema: okEnvelope(data) } } });
const idem = { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 8, maxLength: 128 },
  description: "Opcional. Mesma chave + mesmo corpo em até 24h devolve a resposta original sem criar de novo." };
const q = (name: string, type: string, required = false, extra: object = {}) => ({ name, in: "query", required, schema: { type, ...extra } });

const reservation = {
  type: "object",
  properties: {
    protocol: { type: "string", example: "CAD-261101-A1B2C" },
    status: { type: "string", enum: ["pendente", "confirmada", "cancelada", "concluida", "nao_compareceu"] },
    unit_name: { type: "string" }, date: { type: "string", format: "date" }, time: { type: "string", example: "20:00" },
    party_size: { type: "integer" }, is_large_group: { type: "boolean" },
  },
};

export function buildOpenApi(origin: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Candeeiro — API do SDR",
      version: "1.0.0",
      description: "Ferramentas do SDR de WhatsApp. Nunca afirme disponibilidade sem consultar /availability. " +
        "Use o campo mensagem_sugerida: ele não promete confirmação nem prazo.",
    },
    servers: [{ url: `${origin}/api/public/sdr` }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Chave criada em Painel > Integrações > SDR" } },
      responses: {
        Error: {
          description: "Erro padronizado",
          content: { "application/json": { schema: {
            type: "object",
            properties: { ok: { type: "boolean", example: false }, error: { type: "object", properties: {
              code: { type: "string", enum: Object.keys(API_ERRORS) }, message: { type: "string" } } } },
          } } },
        },
      },
    },
    paths: {
      "/units": { get: { operationId: "listarUnidades", summary: "Unidades ativas que aceitam reservas", responses: {
        200: resp("Lista de unidades", { type: "array", items: { type: "object", properties: {
          id: { type: "string", format: "uuid" }, slug: { type: "string" }, name: { type: "string" }, address: { type: "string" },
          city: { type: "string" }, large_group_threshold: { type: "integer" }, max_advance_days: { type: "integer" },
          hours: { type: "array", items: { type: "object", properties: { weekday: { type: "integer", description: "0=domingo" },
            start: { type: "string" }, end: { type: "string" }, shift: { type: "string" } } } } } } }),
        401: err, 429: err } } },
      "/availability": { get: { operationId: "consultarDisponibilidade",
        summary: "Horários com vaga (date) ou datas com vaga (from+to)",
        parameters: [q("unit_id", "string", false, { format: "uuid" }), q("unit_slug", "string"), q("date", "string", false, { format: "date" }),
          q("from", "string", false, { format: "date" }), q("to", "string", false, { format: "date" }), q("party_size", "integer", false, { minimum: 1 })],
        responses: { 200: resp("Disponibilidade", { type: "object", properties: {
          slots: { type: "array", items: { type: "object", properties: { time: { type: "string" }, remaining_seats: { type: "integer" } } } },
          dates: { type: "array", items: { type: "string", format: "date" } } } }), 401: err, 404: err, 422: err } } },
      "/reservations": {
        get: { operationId: "consultarReservas", summary: "Reservas do telefone (futuras e últimos 30 dias)",
          parameters: [q("phone", "string", true), q("protocol", "string")],
          responses: { 200: resp("Reservas", { type: "array", items: reservation }), 401: err, 422: err } },
        post: { operationId: "criarReserva", summary: "Cria reserva (origem sdr_whatsapp)", parameters: [idem],
          requestBody: jsonBody({ type: "object", required: ["unit_id", "date", "time", "party_size", "full_name", "phone"], properties: {
            unit_id: { type: "string", format: "uuid" }, date: { type: "string", format: "date" }, time: { type: "string", example: "20:00" },
            party_size: { type: "integer", minimum: 1 }, full_name: { type: "string" }, phone: { type: "string", example: "11987654321" },
            notes: { type: "string" }, whatsapp_opt_in: { type: "boolean", default: true },
            conversation_external_id: { type: "string" }, contact_external_id: { type: "string" } } }),
          responses: { 201: resp("Reserva criada (pode estar pendente)", reservation), 401: err, 404: err, 409: err, 422: err } },
      },
      "/reservations/{protocol}": { patch: { operationId: "alterarOuCancelarReserva", summary: "Alterar ou cancelar (exige o telefone dono)",
        parameters: [{ name: "protocol", in: "path", required: true, schema: { type: "string" } }, idem],
        requestBody: jsonBody({ oneOf: [
          { type: "object", required: ["action", "phone"], properties: { action: { type: "string", enum: ["alterar"] }, phone: { type: "string" },
            date: { type: "string", format: "date" }, time: { type: "string" }, party_size: { type: "integer" } } },
          { type: "object", required: ["action", "phone", "reason"], properties: { action: { type: "string", enum: ["cancelar"] },
            phone: { type: "string" }, reason: { type: "string" } } }] }),
        responses: { 200: resp("Reserva atualizada", reservation), 401: err, 404: err, 409: err, 422: err } } },
      "/sac": { post: { operationId: "abrirSac", summary: "Abre atendimento SAC (protocolo SAC-AAMMDD-XXXXX)", parameters: [idem],
        requestBody: jsonBody({ type: "object", required: ["category", "subject", "phone"], properties: {
          category: { type: "string", enum: SAC_CATEGORIES }, subject: { type: "string" }, description: { type: "string" },
          unit_id: { type: "string", format: "uuid" }, phone: { type: "string" }, full_name: { type: "string" },
          priority: { type: "string", enum: SAC_PRIORITIES }, human_requested: { type: "boolean" }, conversation_external_id: { type: "string" } } }),
        responses: { 201: resp("Ticket aberto", { type: "object", properties: { protocol: { type: "string" }, status: { type: "string" } } }),
          401: err, 404: err, 422: err } } },
      "/conversations/classify": { post: { operationId: "classificarConversa", summary: "Classifica a conversa (upsert por external_id)",
        requestBody: jsonBody({ type: "object", required: ["external_id", "classification"], properties: {
          external_id: { type: "string" }, classification: { type: "string", enum: CLASSIFICATIONS }, intent: { type: "string" },
          tags: { type: "array", items: { type: "string" } }, unit_id: { type: "string", format: "uuid" }, result: { type: "string" },
          summary: { type: "string", maxLength: 500 }, started_at: { type: "string", format: "date-time" },
          completed_at: { type: "string", format: "date-time" }, reservation_protocol: { type: "string" }, sac_protocol: { type: "string" },
          contact_external_id: { type: "string" }, phone: { type: "string" }, contact_name: { type: "string" } } }),
        responses: { 200: resp("Conversa registrada", { type: "object", properties: { conversation_id: { type: "string" }, created: { type: "boolean" } } }),
          401: err, 404: err, 422: err } } },
      "/handoff": { post: { operationId: "pedirAtendimentoHumano", summary: "Encaminha para atendimento humano", parameters: [idem],
        requestBody: jsonBody({ type: "object", required: ["conversation_external_id", "phone"], properties: {
          conversation_external_id: { type: "string" }, phone: { type: "string" }, full_name: { type: "string" },
          unit_id: { type: "string", format: "uuid" }, reason: { type: "string" } } }),
        responses: { 200: resp("Encaminhado", { type: "object", properties: { sac_protocol: { type: "string" }, sac_created: { type: "boolean" } } }),
          401: err, 422: err } } },
    },
  };
}
