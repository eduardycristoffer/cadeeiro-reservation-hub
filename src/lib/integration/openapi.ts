import { CLASSIFICATIONS, OCCASION_IDS, PAYMENT_METHODS, SAC_CATEGORIES, SAC_PRIORITIES, SERVICE_IDS } from "./sdr-schemas";
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
      version: "1.2.0",
      description: "Ferramentas do SDR de WhatsApp. Nunca afirme disponibilidade sem consultar /availability. " +
        "Valores só pelo /prices (nunca invente). Use o campo mensagem_sugerida: ele não promete confirmação nem prazo. " +
        "Cada chave pode atender unidades específicas. Chaves sem restrição continuam atendendo todas. Todos os endpoints validam o escopo no servidor; " +
        "unidades fora dele são tratadas como inexistentes e consultas por telefone retornam somente registros permitidos.",
    },
    servers: [{ url: `${origin}/api/public/sdr` }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Chave criada em Painel > Integrações > SDR. Selecione explicitamente as unidades atendidas ou Todas as unidades. Chaves antigas sem vínculos mantêm acesso irrestrito." } },
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
          city: { type: "string" }, phone: { type: "string" }, description: { type: "string" },
          services: { type: "array", items: { type: "string", enum: SERVICE_IDS } }, has_delivery: { type: "boolean" },
          agent_notes: { type: "string", description: "Informações da unidade para o atendente (ex.: brinquedoteca)." },
          large_group_threshold: { type: "integer" }, max_advance_days: { type: "integer" },
          hours: { type: "array", items: { type: "object", properties: { weekday: { type: "integer", description: "0=domingo" },
            start: { type: "string" }, end: { type: "string" }, shift: { type: "string" } } } } } } }),
        401: err, 429: err } } },
      "/context": { get: { operationId: "contextoDaConversa",
        summary: "Abertura da conversa: data de hoje, unidade da caixa de entrada, unidades e valores de hoje",
        description: "Informe inbox (conta:caixa, ex.: 15:49). Caixa sem mapeamento ou mapeada fora do escopo: unidade e precos vêm null. A lista contém somente unidades permitidas. unit_id/unit_slug fora do escopo: UNIT_NOT_FOUND.",
        parameters: [q("inbox", "string"), q("unit_slug", "string"), q("date", "string", false, { format: "date" })],
        responses: { 200: resp("Contexto", { type: "object", properties: {
          hoje: { type: "object", properties: { data: { type: "string" }, dia_da_semana: { type: "string" } } },
          unidade: { type: "object", nullable: true }, unidades: { type: "array", items: { type: "object" } },
          precos: { type: "object", nullable: true } } }), 401: err, 422: err } } },
      "/prices": { get: { operationId: "consultarValores",
        summary: "Valores vigentes da unidade na data (padrão: hoje), por serviço, com política infantil",
        description: "Fonte única dos valores (editáveis no painel). Campo texto traz a tabela completa no estilo da divulgação; servicos traz as linhas estruturadas e o valor de hoje.",
        parameters: [q("unit_id", "string", false, { format: "uuid" }), q("unit_slug", "string"), q("inbox", "string"), q("date", "string", false, { format: "date" })],
        responses: { 200: resp("Valores", { type: "object", properties: {
          unidade: { type: "string" }, data: { type: "string" }, dia_da_semana: { type: "string" }, aviso: { type: "string" }, texto: { type: "string" },
          servicos: { type: "array", items: { type: "object", properties: {
            codigo: { type: "string", enum: SERVICE_IDS }, titulo: { type: "string" }, cobrado_por: { type: "string", enum: ["pessoa", "kg"] },
            tabela: { type: "string" }, vigencia: { type: "string", nullable: true },
            linhas: { type: "array", items: { type: "object", properties: { dias: { type: "string" }, valor: { type: "number" }, valor_texto: { type: "string" } } } },
            hoje: { type: "object", nullable: true, properties: { dia: { type: "string" }, valor: { type: "number" }, valor_texto: { type: "string" } } },
            infantil: { type: "string", nullable: true } } } } } }), 401: err, 404: err, 422: err } } },
      "/delivery": {
        get: { operationId: "consultarPedidosDelivery", summary: "Pedidos de delivery do telefone (últimos 3 dias)",
          parameters: [q("phone", "string", true), q("protocol", "string")],
          responses: { 200: resp("Pedidos", { type: "array", items: { type: "object" } }), 401: err, 422: err } },
        post: { operationId: "registrarPedidoDelivery", summary: "Registra pedido de delivery (só unidades com delivery; a equipe confirma valor e prazo)", parameters: [idem],
          requestBody: jsonBody({ type: "object", required: ["unit_id", "full_name", "phone", "items", "address"], properties: {
            unit_id: { type: "string", format: "uuid" }, full_name: { type: "string" }, phone: { type: "string" },
            items: { type: "string", description: "Itens do pedido em texto livre" }, address: { type: "string" },
            neighborhood: { type: "string" }, address_reference: { type: "string" },
            payment_method: { type: "string", enum: PAYMENT_METHODS }, change_for: { type: "number", description: "Troco para quanto (dinheiro)" },
            notes: { type: "string" }, conversation_external_id: { type: "string" } } }),
          responses: { 201: resp("Pedido registrado", { type: "object", properties: { protocol: { type: "string", example: "DEL-261101-A1B2C" }, status: { type: "string" } } }),
            401: err, 404: err, 409: err, 422: err } },
      },
      "/followups/due": { get: { operationId: "lembretesPendentes", summary: "Lembretes de reserva a enviar agora (véspera e no dia)",
        parameters: [q("limit", "integer", false, { minimum: 1, maximum: 50 })],
        responses: { 200: resp("Lembretes", { type: "array", items: { type: "object", properties: {
          kind: { type: "string", enum: ["lembrete_vespera", "lembrete_dia"] }, protocol: { type: "string" }, unit_name: { type: "string" },
          date: { type: "string" }, time: { type: "string" }, party_size: { type: "integer" }, first_name: { type: "string" },
          phone: { type: "string" }, service: { type: "string" }, occasion: { type: "string" } } } }), 401: err } } },
      "/followups": { post: { operationId: "marcarLembrete", summary: "Registra o resultado do envio de um lembrete",
        requestBody: jsonBody({ type: "object", required: ["protocol", "kind", "ok"], properties: {
          protocol: { type: "string" }, kind: { type: "string", enum: ["lembrete_vespera", "lembrete_dia"] }, ok: { type: "boolean" }, error: { type: "string" } } }),
        responses: { 200: resp("Registrado", { type: "object" }), 401: err, 404: err, 422: err } } },
      "/crm/sends/due": { get: { operationId: "mensagensCrmPendentes",
        summary: "Mensagens de CRM a enviar agora (follow-up pós-visita, reaver inativo/lead, remarketing). Já respeita janela de horário, teto diário e quem pediu para sair",
        parameters: [q("limit", "integer", false, { minimum: 1, maximum: 20 })],
        responses: { 200: resp("Mensagens", { type: "array", items: { type: "object", properties: {
          id: { type: "string", format: "uuid" }, kind: { type: "string", enum: ["followup_pos", "reaver_inativo", "reaver_lead", "remarketing"] },
          phone: { type: "string", description: "E.164, só dígitos" }, first_name: { type: "string" }, text: { type: "string", description: "Mensagem final, já personalizada" },
          unit_id: { type: "string", format: "uuid" }, unit_slug: { type: "string" }, unit_name: { type: "string" }, attempts: { type: "integer" } } } }), 401: err } } },
      "/crm/sends": { post: { operationId: "marcarMensagemCrm", summary: "Registra se a mensagem de CRM foi enviada (ok=false recoloca na fila por 10 min, até 3 tentativas)",
        requestBody: jsonBody({ type: "object", required: ["id", "ok"], properties: {
          id: { type: "string", format: "uuid" }, ok: { type: "boolean" }, error: { type: "string" } } }),
        responses: { 200: resp("Registrado", { type: "object" }), 401: err, 404: err, 422: err } } },
      "/emails/run": { post: { operationId: "dispararEmails", summary: "Envia os e-mails de alerta que estão na fila (chamar a cada minuto; corpo {})",
        responses: { 200: resp("Resultado", { type: "object", properties: { claimed: { type: "integer" }, sent: { type: "integer" }, failed: { type: "integer" }, skipped: { type: "string" } } }), 401: err, 403: err } } },
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
            service: { type: "string", enum: SERVICE_IDS }, occasion: { type: "string", enum: OCCASION_IDS },
            celebrant_name: { type: "string", maxLength: 60 },
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
