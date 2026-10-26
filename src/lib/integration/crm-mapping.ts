// Mapeia eventos de saída para ações no Chatwoot (atributos, etiquetas, nota privada).

export type OutboundPayload = Record<string, unknown> & {
  protocol?: string; status?: string; unit_name?: string; date?: string; time?: string; party_size?: number;
  sac_protocol?: string; reason?: string; phone?: string | null; customer_name?: string | null;
  conversation_external_id?: string | null;
};

export const MANAGED_LABELS = ["reserva-pendente", "reserva-confirmada", "reserva-cancelada", "sac-aberto", "atendimento-humano"] as const;

const RES_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente", confirmada: "Confirmada", cancelada: "Cancelada", concluida: "Concluída", nao_compareceu: "Não compareceu",
};

export function attributesFor(type: string, p: OutboundPayload): Record<string, string | number> {
  if (type.startsWith("reservation.")) {
    const a: Record<string, string | number> = {};
    if (p.protocol) a["reserva_protocolo"] = p.protocol;
    if (p.status) a["reserva_status"] = p.status;
    if (p.unit_name) a["reserva_unidade"] = p.unit_name;
    if (p.date) a["reserva_data"] = String(p.date);
    if (p.time) a["reserva_horario"] = String(p.time).slice(0, 5);
    if (p.party_size) a["reserva_pessoas"] = Number(p.party_size);
    return a;
  }
  if (type.startsWith("sac.")) return { ...(p.protocol ? { sac_protocolo: p.protocol } : {}), ...(p.status ? { sac_status: p.status } : {}) };
  if (type === "handoff.requested" && p.sac_protocol) return { sac_protocolo: p.sac_protocol, sac_status: "aberto" };
  return {};
}

/** Calcula as etiquetas finais a partir das atuais (preserva etiquetas não gerenciadas). */
export function nextLabels(type: string, p: OutboundPayload, current: string[]): string[] {
  const set = new Set(current);
  if (type.startsWith("reservation.") && p.status) {
    for (const l of ["reserva-pendente", "reserva-confirmada", "reserva-cancelada"]) set.delete(l);
    if (p.status === "pendente") set.add("reserva-pendente");
    if (p.status === "confirmada") set.add("reserva-confirmada");
    if (p.status === "cancelada") set.add("reserva-cancelada");
  }
  if (type.startsWith("sac.") && p.status) {
    if (["aberto", "em_andamento", "aguardando_cliente"].includes(p.status)) set.add("sac-aberto");
    else set.delete("sac-aberto");
  }
  if (type === "handoff.requested") { set.add("atendimento-humano"); set.add("sac-aberto"); }
  return [...set].sort();
}

export function privateNoteFor(type: string, p: OutboundPayload): string {
  const when = p.date ? `${p.date} ${String(p.time ?? "").slice(0, 5)}`.trim() : "";
  switch (type) {
    case "reservation.created":
      return `[Candeeiro] Reserva ${p.protocol} criada (${RES_STATUS_LABEL[p.status ?? ""] ?? p.status}) · ${p.unit_name ?? ""} · ${when} · ${p.party_size} pessoas`;
    case "reservation.status_changed":
      return `[Candeeiro] Reserva ${p.protocol}: status ${RES_STATUS_LABEL[p.status ?? ""] ?? p.status}`;
    case "reservation.updated":
      return `[Candeeiro] Reserva ${p.protocol} alterada · ${when} · ${p.party_size} pessoas · ${RES_STATUS_LABEL[p.status ?? ""] ?? p.status}`;
    case "sac.created":
      return `[Candeeiro] SAC ${p.protocol} aberto`;
    case "sac.status_changed":
      return `[Candeeiro] SAC ${p.protocol}: status ${p.status}`;
    case "handoff.requested":
      return `[Candeeiro] Atendimento humano solicitado${p.sac_protocol ? ` · SAC ${p.sac_protocol}` : ""}${p.reason ? ` · Motivo: ${p.reason}` : ""}`;
    default:
      return `[Candeeiro] Evento ${type}`;
  }
}

export const OUTBOUND_TYPES = [
  "reservation.created", "reservation.status_changed", "reservation.updated", "sac.created", "sac.status_changed", "handoff.requested",
] as const;
