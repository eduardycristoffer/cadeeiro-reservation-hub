import { toIsoDate } from "@/lib/format";

export type ReservationStatus = "pendente" | "confirmada" | "cancelada" | "concluida" | "nao_compareceu";
export type ReservationOrigin = "landing_page" | "sdr_whatsapp" | "painel" | "telefone" | "outro";

export const ORIGIN_LABEL: Record<ReservationOrigin, string> = {
  landing_page: "Página de reservas",
  sdr_whatsapp: "WhatsApp (SDR)",
  painel: "Painel",
  telefone: "Telefone",
  outro: "Outro",
};

/** Transições permitidas (espelham a função set_reservation_status no banco). */
export const TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pendente: ["confirmada", "cancelada"],
  confirmada: ["concluida", "nao_compareceu", "cancelada"],
  cancelada: [],
  concluida: [],
  nao_compareceu: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Grupos grandes só podem ser confirmados por gestor ou super admin. */
export function canConfirmLargeGroup(isLargeGroup: boolean, canManage: boolean): boolean {
  return !isLargeGroup || canManage;
}

export type Period = "hoje" | "amanha" | "semana" | "mes" | "intervalo" | "todas";

export function periodRange(period: Period, today: Date, custom?: { from?: string; to?: string }): { from?: string; to?: string } {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const add = (n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return toIsoDate(x); };
  switch (period) {
    case "hoje": return { from: toIsoDate(d), to: toIsoDate(d) };
    case "amanha": return { from: add(1), to: add(1) };
    case "semana": {
      const dow = (d.getDay() + 6) % 7; // segunda = 0
      return { from: add(-dow), to: add(6 - dow) };
    }
    case "mes": {
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { from: toIsoDate(first), to: toIsoDate(last) };
    }
    case "intervalo": return { from: custom?.from || undefined, to: custom?.to || undefined };
    default: return {};
  }
}

/** Link wa.me a partir de telefone em E.164 (+5511...). */
export function waLink(phoneE164: string): string {
  return `https://wa.me/${phoneE164.replace(/\D/g, "")}`;
}

export function formatPhoneE164(phone: string): string {
  const d = phone.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}
