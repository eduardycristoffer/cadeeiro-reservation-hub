/** Regras de inatividade do painel (puras, para testar sem navegador). */
export const IDLE_LIMIT_MS = 30 * 60_000; // sem mexer por 30 min → sai
export const IDLE_WARN_MS = 60_000; // avisa no último minuto
export const ACTIVITY_KEY = "candeeiro:last-activity";

export type IdleState = "ativo" | "aviso" | "expirado";

/** Estado a partir do último movimento. `last` ausente/ inválido conta como "agora" (nunca desloga por falta de dado). */
export function idleState(last: number | null, now: number, limit = IDLE_LIMIT_MS, warn = IDLE_WARN_MS): IdleState {
  if (last === null || !Number.isFinite(last) || last > now) return "ativo";
  const idle = now - last;
  if (idle >= limit) return "expirado";
  if (idle >= limit - warn) return "aviso";
  return "ativo";
}

/** Segundos que faltam para sair (mínimo 0). */
export function secondsLeft(last: number, now: number, limit = IDLE_LIMIT_MS): number {
  return Math.max(0, Math.ceil((last + limit - now) / 1000));
}
