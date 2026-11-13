import { SERVICES, type ServiceId } from "@/lib/reservations";

export const MAX_PEOPLE = 200;
export const QUICK_PEOPLE = [5, 10, 20, 30, 100] as const;
export const NOTE_MAX = 280;
export const WHO_MAX = 60;
export const DEFAULT_WHATSAPP_OPT_IN = false;

/** Rótulo do atalho: de 30 em diante vira "+30", "+100". */
export const quickLabel = (n: number): string => (n >= 30 ? `+${n}` : String(n));

export type ServiceSlug = (typeof SERVICES)[number]["slug"];

/**
 * Valida o parâmetro ?rodizio= (carnes | pizza | quilo) do link de campanha.
 * Devolve o próprio slug: o roteador revalida a URL já normalizada, então a função precisa ser idempotente.
 */
export function serviceSlug(v: unknown): ServiceSlug | undefined {
  if (typeof v !== "string") return undefined;
  const slug = v.trim().toLowerCase();
  return SERVICES.find((s) => s.slug === slug)?.slug;
}

/** Cidades atendidas e o que cada uma oferece na página inicial (regra do negócio). */
export const CITIES = [
  { slug: "goiania", label: "Goiânia", services: ["almoco_quilo", "rodizio_pizza"] },
  { slug: "anapolis", label: "Anápolis", services: ["rodizio_carnes", "rodizio_pizza"] },
] as const satisfies readonly { slug: string; label: string; services: readonly ServiceId[] }[];
export type CitySlug = (typeof CITIES)[number]["slug"];

/** Valida ?cidade= (aceita acento e maiúscula). Devolve o próprio slug: precisa ser idempotente. */
export function citySlug(v: unknown): CitySlug | undefined {
  if (typeof v !== "string") return undefined;
  const slug = v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return CITIES.find((c) => c.slug === slug)?.slug;
}

/** Serviços oferecidos numa cidade (todos, se a cidade não foi informada ou não é conhecida). */
export function servicesForCity(city: unknown): readonly ServiceId[] {
  const slug = citySlug(city);
  return slug ? (CITIES.find((c) => c.slug === slug)?.services ?? SERVICES.map((s) => s.id)) : SERVICES.map((s) => s.id);
}

/** Slug do link (carnes | pizza | quilo) -> id gravado no banco (rodizio_carnes | rodizio_pizza | almoco_quilo). */
export function serviceFromSlug(v: unknown): ServiceId | undefined {
  const slug = serviceSlug(v);
  return SERVICES.find((s) => s.slug === slug)?.id;
}

/**
 * Normaliza o parâmetro ?campanha= para o formato aceito pelo banco (^[a-z0-9_-]{1,60}$).
 * Qualquer outra coisa vira "-"; vazio ou inválido vira undefined.
 */
export function sanitizeCampaign(v: unknown): string | undefined {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const s = String(v)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || undefined;
}

/** Converte o texto do campo (só dígitos) em quantidade de pessoas, entre 0 (vazio) e MAX_PEOPLE. */
export function parsePeople(raw: string): number {
  const n = parseInt(raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 3), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_PEOPLE, Math.max(0, n));
}

/** Hoje e os próximos dias (inclui hoje). */
export function upcomingDays(from: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + i));
}

export const pessoas = (n: number): string => `${n} ${n === 1 ? "pessoa" : "pessoas"}`;

/** Nome e sobrenome (o banco exige pelo menos dois nomes). */
export const isValidFullName = (name: string): boolean => {
  const n = name.trim().replace(/\s+/g, " ");
  return n.length >= 3 && n.includes(" ");
};

/** Sem serviço escolhido lista todas; com serviço, exige oferta explícita da unidade. */
export function unitsForService<T extends { services?: string[] | null }>(units: T[], service: string | null): T[] {
  return units.filter((u) => !service || u.services?.includes(service));
}
