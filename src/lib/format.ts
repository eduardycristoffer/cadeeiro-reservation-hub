export function maskBrPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Valida celular/fixo brasileiro: DDD + 8 ou 9 dígitos (celular começa com 9). */
export function isValidBrPhone(value: string): boolean {
  const d = value.replace(/\D/g, "");
  return /^[1-9][0-9](9[0-9]{8}|[2-8][0-9]{7})$/.test(d);
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromIsoDate(s: string): Date {
  const [y = 1970, m = 1, d = 1] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateLong(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

export const hhmm = (t: string) => t.slice(0, 5);

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  concluida: "Concluída",
  nao_compareceu: "Não compareceu",
};
