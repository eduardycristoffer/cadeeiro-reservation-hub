// Cliente mínimo da API REST padrão do Chatwoot (Tryade CRM).
export type CrmConfig = { baseUrl: string; accountId: string; token: string };

export class ChatwootError extends Error {
  constructor(message: string, public status: number, public endpoint: string) { super(message); }
}

export async function cw<T = unknown>(cfg: CrmConfig, method: string, path: string, body?: unknown): Promise<T> {
  const endpoint = `/api/v1/accounts/${cfg.accountId}${path}`;
  const res = await fetch(`${cfg.baseUrl}${endpoint}`, {
    method,
    headers: { api_access_token: cfg.token, "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  if (!res.ok) throw new ChatwootError(`HTTP ${res.status}: ${text.slice(0, 200)}`, res.status, `${method} ${endpoint.replace(/\d+/g, ":id")}`);
  return (text ? JSON.parse(text) : {}) as T;
}

type Contact = { id: number; phone_number?: string | null };

export async function findOrCreateContact(cfg: CrmConfig, phoneDigits: string, name?: string | null): Promise<number> {
  const e164 = `+${phoneDigits}`;
  const found = await cw<{ payload?: Contact[] }>(cfg, "GET", `/contacts/search?q=${encodeURIComponent(e164)}`);
  const hit = found.payload?.find((c) => (c.phone_number ?? "").replace(/\D/g, "") === phoneDigits);
  if (hit) return hit.id;
  const created = await cw<{ payload?: { contact?: Contact } } & Partial<Contact>>(cfg, "POST", "/contacts", {
    name: name || e164, phone_number: e164,
  });
  const id = created.payload?.contact?.id ?? created.id;
  if (!id) throw new ChatwootError("Resposta sem id do contato", 500, "POST /contacts");
  return id;
}

export async function getLabels(cfg: CrmConfig, kind: "conversations" | "contacts", id: string | number): Promise<string[]> {
  const r = await cw<{ payload?: string[] }>(cfg, "GET", `/${kind}/${id}/labels`);
  return r.payload ?? [];
}

export async function setLabels(cfg: CrmConfig, kind: "conversations" | "contacts", id: string | number, labels: string[]) {
  await cw(cfg, "POST", `/${kind}/${id}/labels`, { labels });
}
