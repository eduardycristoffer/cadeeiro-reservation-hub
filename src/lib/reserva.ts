import { SERVICES, type ServiceId } from "@/lib/reservations";

export const MAX_PEOPLE = 200;
export const QUICK_PEOPLE = [5, 10, 20, 30, 100] as const;
export const NOTE_MAX = 280;
export const WHO_MAX = 60;

/** Rótulo do atalho: de 30 em diante vira "+30", "+100". */
export const quickLabel = (n: number): string => (n >= 30 ? `+${n}` : String(n));

export type ServiceSlug = (typeof SERVICES)[number]["slug"];

/**
 * Valida o parâmetro ?rodizio= (carnes | pizza) do link de campanha.
 * Devolve o próprio slug: o roteador revalida a URL já normalizada, então a função precisa ser idempotente.
 */
export function serviceSlug(v: unknown): ServiceSlug | undefined {
  if (typeof v !== "string") return undefined;
  const slug = v.trim().toLowerCase();
  return SERVICES.find((s) => s.slug === slug)?.slug;
}

/** Slug do link (carnes | pizza) -> id gravado no banco (rodizio_carnes | rodizio_pizza). */
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
