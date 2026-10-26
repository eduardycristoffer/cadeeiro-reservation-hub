import { db } from "./sdr.server";
import { ChatwootError, cw, findOrCreateContact, getLabels, setLabels, type CrmConfig } from "./chatwoot.server";
import { attributesFor, nextLabels, privateNoteFor, type OutboundPayload } from "@/lib/integration/crm-mapping";

export async function loadCrmConfig(): Promise<{ cfg: CrmConfig | null; missing: string[] }> {
  const { data: s } = await db().from("integration_settings")
    .select("is_enabled,base_url,config").eq("provider", "tryade_crm").order("created_at").limit(1).maybeSingle();
  const token = process.env["TRYADE_CRM_API_TOKEN"];
  const accountId = (s?.config as { account_id?: string } | null)?.account_id;
  const missing = [
    ...(!s?.is_enabled ? ["integração desativada"] : []),
    ...(!s?.base_url ? ["URL base"] : []),
    ...(!accountId ? ["ID da conta"] : []),
    ...(!token ? ["secret TRYADE_CRM_API_TOKEN"] : []),
  ];
  if (missing.length) return { cfg: null, missing };
  return { cfg: { baseUrl: s!.base_url!, accountId: accountId!, token: token! }, missing: [] };
}

async function processEvent(cfg: CrmConfig, type: string, p: OutboundPayload): Promise<string> {
  const conv = p.conversation_external_id ? String(p.conversation_external_id) : null;
  let contactId: number | null = null;
  if (p.phone) {
    contactId = await findOrCreateContact(cfg, String(p.phone), p.customer_name);
    const attrs = attributesFor(type, p);
    if (Object.keys(attrs).length) await cw(cfg, "PUT", `/contacts/${contactId}`, { custom_attributes: attrs });
  }
  if (conv) {
    const current = await getLabels(cfg, "conversations", conv);
    const next = nextLabels(type, p, current);
    if (next.join() !== [...current].sort().join()) await setLabels(cfg, "conversations", conv, next);
    await cw(cfg, "POST", `/conversations/${conv}/messages`, { content: privateNoteFor(type, p), message_type: "outgoing", private: true });
    return "conversation";
  }
  if (contactId) {
    const current = await getLabels(cfg, "contacts", contactId);
    const next = nextLabels(type, p, current);
    if (next.join() !== [...current].sort().join()) await setLabels(cfg, "contacts", contactId, next);
    return "contact";
  }
  return "nothing_to_update";
}

/** Processa a fila de saída. Sem configuração, não toca nos eventos (continuam pendentes). */
export async function runCrmWorker() {
  const { cfg, missing } = await loadCrmConfig();
  if (!cfg) {
    const { count } = await db().from("crm_events").select("id", { count: "exact", head: true })
      .eq("direction", "outbound").eq("status", "pendente");
    return { ok: true, skipped: "CRM não configurado", missing, pending: count ?? 0 };
  }
  const { data: events, error } = await db().rpc("crm_claim_outbound", { _limit: 5 });
  if (error) return { ok: false, error: error.message };
  const results: { id: string; ok: boolean }[] = [];
  for (const e of (events ?? []) as { id: string; event_type: string; payload: OutboundPayload; organization_id: string | null; attempts: number }[]) {
    let okFlag = false; let err: string | null = null; let status = 200; let endpoint = "";
    try {
      endpoint = await processEvent(cfg, e.event_type, e.payload);
      okFlag = true;
    } catch (x) {
      err = x instanceof Error ? x.message : String(x);
      if (x instanceof ChatwootError) { status = x.status; endpoint = x.endpoint; } else status = 0;
    }
    await db().rpc("crm_finish_outbound", { _id: e.id, _ok: okFlag, _error: err });
    await db().from("integration_event_logs").insert({
      organization_id: e.organization_id, provider: "tryade_crm", direction: "outbound", endpoint,
      status_code: status, request: { event_id: e.id, event_type: e.event_type, attempt: e.attempts },
      response: { ok: okFlag }, error: err,
    });
    results.push({ id: e.id, ok: okFlag });
  }
  return { ok: true, processed: results.length, failed: results.filter((r) => !r.ok).length };
}
