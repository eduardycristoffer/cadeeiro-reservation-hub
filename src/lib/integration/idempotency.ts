export type IdemRecord = { request_hash: string; status_code: number | null; response: unknown; expires_at: string };

export type IdemDecision =
  | { action: "proceed" }
  | { action: "replay"; status: number; body: unknown }
  | { action: "conflict" }
  | { action: "in_progress" };

/** Decide o que fazer com uma requisição que trouxe Idempotency-Key. */
export function decideIdempotency(existing: IdemRecord | null, requestHash: string, now: Date = new Date()): IdemDecision {
  if (!existing || new Date(existing.expires_at) <= now) return { action: "proceed" };
  if (existing.request_hash !== requestHash) return { action: "conflict" };
  if (existing.status_code === null) return { action: "in_progress" };
  return { action: "replay", status: existing.status_code, body: existing.response };
}

export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_\-:.]{8,128}$/;
