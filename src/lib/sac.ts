export type SacStatus = "aberto" | "em_andamento" | "aguardando_cliente" | "resolvido" | "encerrado";
export type SacPriority = "baixa" | "media" | "alta" | "urgente";

export const SAC_STATUS: { k: SacStatus; label: string; chip: string }[] = [
  { k: "aberto", label: "Novo", chip: "bg-status-pending-bg text-status-pending" },
  { k: "em_andamento", label: "Em atendimento", chip: "bg-status-done-bg text-status-done" },
  { k: "aguardando_cliente", label: "Aguardando cliente", chip: "bg-status-noshow-bg text-status-noshow" },
  { k: "resolvido", label: "Resolvido", chip: "bg-status-confirmed-bg text-status-confirmed" },
  { k: "encerrado", label: "Sem solução", chip: "bg-status-cancelled-bg text-status-cancelled" },
];
export const sacStatusLabel = (s: string) => SAC_STATUS.find((x) => x.k === s)?.label ?? s;

export const PRIORITY: Record<SacPriority, string> = { baixa: "Baixa", media: "Normal", alta: "Alta", urgente: "Crítica" };

export const COMPLAINT_TYPES: Record<string, string> = {
  atendimento: "Atendimento", comida: "Comida", demora: "Demora", cobranca: "Cobrança", limpeza: "Limpeza", reserva: "Reserva", outro: "Outro",
};
// categorias antigas (SDR) também aparecem com nome legível
const LEGACY: Record<string, string> = {
  reclamacao: "Reclamação", elogio: "Elogio", sugestao: "Sugestão", duvida: "Dúvida", problema_reserva: "Reserva", atendimento: "Atendimento", outros: "Outro",
};
export const typeLabel = (t: string | null | undefined, category?: string | null) =>
  (t && COMPLAINT_TYPES[t]) || (category && LEGACY[category]) || (t ? LEGACY[t] ?? t : "—");

export const ORIGIN: Record<string, string> = {
  sdr_whatsapp: "WhatsApp (SDR)", telefone: "Telefone", presencial: "Presencial", site: "Site", whatsapp: "WhatsApp", email: "E-mail", painel: "Painel",
};

export const SLA: Record<string, { label: string; chip: string }> = {
  no_prazo: { label: "No prazo", chip: "bg-status-confirmed-bg text-status-confirmed" },
  vence_em_breve: { label: "Vence em breve", chip: "bg-status-pending-bg text-status-pending" },
  atrasado: { label: "Atrasado", chip: "bg-status-cancelled-bg text-status-cancelled" },
};

export const SAC_ERRORS: Record<string, string> = {
  RESOLUTION_REQUIRED: "Escreva a resolução.",
  REASON_REQUIRED: "Escreva o motivo.",
  INVALID_PHONE: "Confira o telefone (DDD + número).",
  INVALID_SUBJECT: "Escreva um assunto com pelo menos 3 letras.",
  INVALID_ASSIGNEE: "Essa pessoa não tem acesso a esta unidade.",
  INVALID_NOTE: "Escreva pelo menos algumas palavras.",
  USE_REOPEN: "Reabra o chamado primeiro.",
  ALREADY_CLOSED: "Este chamado já foi fechado.",
  FORBIDDEN: "Você não tem acesso a este chamado.",
};
export const sacError = (msg: string) => SAC_ERRORS[Object.keys(SAC_ERRORS).find((k) => msg.includes(k)) ?? ""] ?? msg;
