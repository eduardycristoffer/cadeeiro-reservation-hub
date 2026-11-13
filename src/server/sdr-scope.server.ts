import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/integration/errors";
import { classifyBody, createReservationBody, crmSendMarkBody, deliveryBody, followupMarkBody, handoffBody, sacBody } from "@/lib/integration/sdr-schemas";

export type UnitScope = { organization_id: string; unit_ids: string[] };

export function allowsUnit(key: UnitScope, id: string | null | undefined) {
  return key.unit_ids.length === 0 || (typeof id === "string" && key.unit_ids.includes(id));
}

export function scopedUnits<T extends { id: string }>(key: UnitScope, rows: T[]) {
  return rows.filter((row) => allowsUnit(key, row.id));
}

/** Fail closed on query errors. No privileged row is ever returned to the caller. */
async function lookup(client: SupabaseClient, key: UnitScope, table: string, field: string, value: string) {
  const { data, error } = await client.from(table).select("unit_id,reservation_id,sac_ticket_id")
    .eq("organization_id", key.organization_id).eq(field, value).maybeSingle();
  if (error) throw new ApiError("INTERNAL_ERROR");
  return data as { unit_id: string | null; reservation_id?: string | null; sac_ticket_id?: string | null } | null;
}

async function record(client: SupabaseClient, key: UnitScope, table: string, field: string, value: string, code: string, nullable = false) {
  // Only conversations have link columns; other records need only their unit.
  const { data, error } = await client.from(table).select("unit_id")
    .eq("organization_id", key.organization_id).eq(field, value).maybeSingle();
  if (error) throw new ApiError("INTERNAL_ERROR");
  if (!data || (!allowsUnit(key, data.unit_id) && !(nullable && data.unit_id === null))) throw new ApiError(code);
  return data as { unit_id: string | null; reservation_id?: string | null; sac_ticket_id?: string | null };
}

async function conversation(client: SupabaseClient, key: UnitScope, externalId?: string | null) {
  if (!externalId) return;
  const existing = await lookup(client, key, "crm_conversations", "external_id", externalId);
  if (!existing) return;
  if (existing.unit_id !== null && !allowsUnit(key, existing.unit_id)) throw new ApiError("UNIT_NOT_FOUND");
  if (existing.reservation_id) await record(client, key, "reservations", "id", existing.reservation_id, "RESERVATION_NOT_FOUND");
  if (existing.sac_ticket_id) await record(client, key, "sac_tickets", "id", existing.sac_ticket_id, "SAC_NOT_FOUND", true);
}

/** Runs before idempotency replay, so narrowing a key cannot replay out-of-scope data. */
export async function authorizeSdrScope(client: SupabaseClient, key: UnitScope, endpoint: string, method: string, body: unknown) {
  if (!key.unit_ids.length || method === "GET") return;
  const parse = <T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): T => {
    const result = schema.safeParse(body);
    if (!result.success || result.data === undefined) throw new ApiError("VALIDATION_ERROR");
    return result.data;
  };
  async function unit(id?: string | null, code = "UNIT_NOT_FOUND") {
    if (!id) return;
    if (!allowsUnit(key, id)) throw new ApiError(code);
    const { data, error } = await client.from("units").select("id").eq("id", id).eq("organization_id", key.organization_id).maybeSingle();
    if (error) throw new ApiError("INTERNAL_ERROR");
    if (!data) throw new ApiError(code);
  }
  if (endpoint === "/reservations") {
    const b = parse(createReservationBody);
    await unit(b.unit_id, "UNIT_UNAVAILABLE");
    await conversation(client, key, b.conversation_external_id);
  } else if (endpoint === "/delivery") {
    const b = parse(deliveryBody);
    await unit(b.unit_id, "UNIT_NOT_FOUND");
    await conversation(client, key, b.conversation_external_id);
  } else if (endpoint === "/reservations/{protocol}" || endpoint === "/followups") {
    const protocol = endpoint === "/followups" ? parse(followupMarkBody).protocol : (body as { protocol?: string } | null)?.protocol;
    if (!protocol) throw new ApiError("RESERVATION_NOT_FOUND");
    await record(client, key, "reservations", "protocol", protocol.trim().toUpperCase(), "RESERVATION_NOT_FOUND");
  } else if (endpoint === "/crm/sends") {
    // envio sem unidade só passa por chave sem restrição de unidade; falha fechado
    await record(client, key, "crm_sends", "id", parse(crmSendMarkBody).id, "NOT_FOUND");
  } else if (endpoint === "/sac") {
    const b = parse(sacBody);
    await unit(b.unit_id);
    await conversation(client, key, b.conversation_external_id);
  } else if (endpoint === "/handoff") {
    const b = parse(handoffBody);
    await unit(b.unit_id);
    await conversation(client, key, b.conversation_external_id);
  } else if (endpoint === "/conversations/classify") {
    const b = parse(classifyBody);
    await unit(b.unit_id);
    await conversation(client, key, b.external_id);
    if (b.reservation_protocol?.trim()) await record(client, key, "reservations", "protocol", b.reservation_protocol.trim().toUpperCase(), "RESERVATION_NOT_FOUND");
    if (b.sac_protocol?.trim()) await record(client, key, "sac_tickets", "protocol", b.sac_protocol.trim().toUpperCase(), "SAC_NOT_FOUND", true);
  }
}

/** Old delivery responses lack unit_id: authorize via the backing record, never via the display name. */
export async function scopedResults<T extends { protocol: string }>(client: SupabaseClient, key: UnitScope, table: string, rows: T[]) {
  if (!key.unit_ids.length || !rows.length) return rows;
  const { data, error } = await client.from(table).select("protocol")
    .eq("organization_id", key.organization_id).in("unit_id", key.unit_ids).in("protocol", rows.map((r) => r.protocol));
  if (error) throw new ApiError("INTERNAL_ERROR");
  const allowed = new Set((data ?? []).map((r) => r.protocol));
  return rows.filter((r) => allowed.has(r.protocol));
}