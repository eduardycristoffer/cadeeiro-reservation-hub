import type { ServiceId } from "@/lib/reservations";

export const OFERTA = {
  goiania: { nome: "Goiânia", servicos: ["almoco_quilo", "rodizio_pizza"] },
  anapolis: { nome: "Anápolis", servicos: ["rodizio_carnes", "rodizio_pizza"] },
} as const satisfies Record<string, { nome: string; servicos: readonly ServiceId[] }>;
export type Cidade = keyof typeof OFERTA;
export const CIDADES = Object.keys(OFERTA) as Cidade[];
export const LGPD_TEXT = "Aceito o uso de nome e WhatsApp para esta reserva e atendimento (LGPD).";
export function cidadeValida(v: unknown): Cidade | undefined {
  return v === "goiania" || v === "anapolis" ? v : undefined;
}
export function servicoValido(v: unknown): ServiceId | undefined {
  return v === "almoco_quilo" || v === "rodizio_carnes" || v === "rodizio_pizza" ? v : undefined;
}
export function ofertaAceita(cidade: Cidade, servico: ServiceId): boolean {
  return (OFERTA[cidade].servicos as readonly ServiceId[]).includes(servico);
}
export function whatsappDestino(
  numero: string | null | undefined,
  nome: string,
  cidade: Cidade,
): string | null {
  const digits = (numero ?? "").replace(/\D/g, "");
  if (!/^55\d{10,11}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(`Olá! Sou ${nome.trim()} e gostaria de falar com o Candeeiro ${OFERTA[cidade].nome}.`)}`;
}
