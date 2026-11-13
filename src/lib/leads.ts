/** Leads do botão de WhatsApp: rótulos, filtros e idade (puro, testado). */

export type LeadStatus = "novo" | "em_atendimento" | "reservou" | "perdido";
export type LeadRow = {
  id: string; city: "goiania" | "anapolis"; full_name: string; phone_e164: string; campaign: string | null; source: string;
  page: string | null; clicks: number; status: LeadStatus; status_note: string | null; created_at: string; updated_at: string;
  utm: Record<string, string> | null;
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo", em_atendimento: "Em atendimento", reservou: "Reservou", perdido: "Perdido",
};
export const LEAD_STATUS_CHIP: Record<LeadStatus, string> = {
  novo: "bg-status-pending-bg text-status-pending",
  em_atendimento: "bg-status-confirmed-bg text-status-confirmed",
  reservou: "bg-status-done-bg text-status-done",
  perdido: "bg-status-cancelled-bg text-status-cancelled",
};
export const CITY_LABEL: Record<string, string> = { goiania: "Goiânia", anapolis: "Anápolis" };

/** "agora", "há 5 min", "há 3 h", "há 2 d" — para a fila de atendimento. */
export function ageLabel(iso: string, now: Date = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} d`;
}

/** Lead "novo" há mais de 15 min sem ninguém atender merece destaque. */
export function isStale(row: Pick<LeadRow, "status" | "created_at">, now: Date = new Date()): boolean {
  return row.status === "novo" && now.getTime() - new Date(row.created_at).getTime() > 15 * 60000;
}

/** Contagem por status para os chips de filtro. */
export function countByStatus(rows: readonly Pick<LeadRow, "status">[]): Record<LeadStatus | "todos", number> {
  const out = { todos: rows.length, novo: 0, em_atendimento: 0, reservou: 0, perdido: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
}
