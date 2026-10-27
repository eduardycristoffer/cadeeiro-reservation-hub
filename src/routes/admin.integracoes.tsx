import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/admin/bits";
import { useAuth } from "@/lib/auth";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { getCrmRuntimeStatus, testCrmConnection } from "@/lib/integrations.functions";
import { maskPhone } from "@/lib/integration/phone";
import { OUTBOUND_TYPES } from "@/lib/integration/crm-mapping";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/integracoes")({
  head: () => ({ meta: [{ name: "description", content: "Configuração de integrações da Rede Candeeiro." }, { property: "og:title", content: "Integrações — Candeeiro Gestão" }, { property: "og:description", content: "Configuração de integrações da Rede Candeeiro." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Integrações — Candeeiro Gestão" }, { name: "robots", content: "noindex" }] }),
  component: Integracoes,
});

const sb = () => requireSupabase();

function publicOrigin() {
  if (typeof window === "undefined") return "";
  const o = window.location.origin;
  return /preview|localhost|lovable\.app/.test(o) ? "https://candeeiro.tryade.com.br" : o;
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success("Copiado"));
}

function Integracoes() {
  const { roles } = useAuth();
  if (!roles.includes("super_admin")) return <p className="text-muted-foreground">Somente o super admin acessa as integrações.</p>;
  return (
    <div className="fade-up">
      <h1 className="text-4xl font-semibold">Integrações</h1>
      <p className="mt-1 text-muted-foreground">Tryade CRM (canal de WhatsApp) e o SDR que atende pelo n8n.</p>
      <Tabs defaultValue="crm" className="mt-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl sm:grid-cols-4">
          <TabsTrigger value="crm" className="h-11 rounded-xl">Tryade CRM</TabsTrigger>
          <TabsTrigger value="sdr" className="h-11 rounded-xl">SDR (n8n)</TabsTrigger>
          <TabsTrigger value="fila" className="h-11 rounded-xl">Fila de eventos</TabsTrigger>
          <TabsTrigger value="conversas" className="h-11 rounded-xl">Conversas</TabsTrigger>
        </TabsList>
        <TabsContent value="crm"><CrmTab /></TabsContent>
        <TabsContent value="sdr"><SdrTab /></TabsContent>
        <TabsContent value="fila"><QueueTab /></TabsContent>
        <TabsContent value="conversas"><ConversationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function Panel({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mt-4 min-w-0 border-t py-5", className)}>
      {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "err" | "idle"; children: React.ReactNode }) {
  const dot = { ok: "bg-success", warn: "bg-warning", err: "bg-destructive", idle: "bg-muted-foreground/50" }[tone];
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-medium"><span className={cn("h-1.5 w-1.5 rounded-full", dot)} />{children}</span>;
}

type Settings = { base_url: string | null; account_id: string | null; enabled: boolean; has_webhook_token: boolean; webhook_token_rotated_at: string | null };

function CrmTab() {
  const [s, setS] = useState<Settings | null>(null);
  const [rt, setRt] = useState<{ hasApiToken: boolean; hasHmacSecret: boolean } | null>(null);
  const [failed, setFailed] = useState(0);
  const [url, setUrl] = useState(""); const [acc, setAcc] = useState(""); const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; error: string | null; inboxes: { id: string; name: string }[] } | null>(null);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [maps, setMaps] = useState<{ id: string; inbox_external_id: string; unit_id: string }[]>([]);
  const [newInbox, setNewInbox] = useState(""); const [newUnit, setNewUnit] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    const [a, b, c, d] = await Promise.all([
      sb().rpc("admin_get_crm_settings"),
      sb().from("crm_events").select("id", { count: "exact", head: true }).eq("direction", "outbound").eq("status", "falhou")
        .gte("updated_at", new Date(Date.now() - 86400000).toISOString()),
      sb().from("units").select("id,name").order("name"),
      sb().from("crm_inbox_units").select("id,inbox_external_id,unit_id").order("inbox_external_id"),
    ]);
    if (a.error || !a.data) { setLoadError(a.error ? friendlyError(a.error) : "Configuração indisponível."); return; }
    setLoadError(null);
    const st = a.data as Settings;
    setS(st); setUrl(st.base_url ?? ""); setAcc(st.account_id ?? ""); setEnabled(st.enabled);
    setFailed(b.count ?? 0);
    setUnits((c.data ?? []) as { id: string; name: string }[]);
    setMaps((d.data ?? []) as typeof maps);
  }
  useEffect(() => {
    load();
    getCrmRuntimeStatus().then(setRt).catch(() => setRt({ hasApiToken: false, hasHmacSecret: false }));
  }, []);

  if (loadError) return <div role="alert" className="mt-4 space-y-3 text-sm"><p>{loadError}</p><Button variant="outline" onClick={load}>Tentar novamente</Button></div>;
  if (!s || !rt) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const pend = [
    !s.base_url && "URL base do Tryade CRM",
    !s.account_id && "ID da conta no Tryade CRM",
    !rt.hasApiToken && "Secret TRYADE_CRM_API_TOKEN (token de acesso do Chatwoot), em Project Settings → Secrets",
    !s.has_webhook_token && "Token do webhook (gere abaixo e cadastre a URL no Chatwoot)",
    !s.enabled && "Ativar a integração",
  ].filter(Boolean) as string[];
  const configured = pend.length === 0;
  const status = !configured ? <Pill tone="idle">Não configurado</Pill> : failed > 0 || test?.ok === false ? <Pill tone="err">Com erro</Pill> : <Pill tone="ok">Configurado</Pill>;

  async function save() {
    setSaving(true);
    const { error } = await sb().rpc("admin_save_crm_settings", { _base_url: url, _account_id: acc, _enabled: enabled });
    setSaving(false);
    if (error) {
      const m = error.message;
      toast.error(m.includes("INVALID_URL") ? "A URL precisa começar com https://" : m.includes("INVALID_ACCOUNT") ? "ID da conta deve ser numérico." :
        m.includes("CRM_INCOMPLETE") ? "Preencha URL e ID da conta antes de ativar." : friendlyError(error));
      return;
    }
    toast.success("Configuração salva"); load();
  }
  async function rotate() {
    if (s?.has_webhook_token && !confirm("Gerar um novo token invalida a URL atual do webhook. Continuar?")) return;
    const { data, error } = await sb().rpc("admin_rotate_crm_webhook_token");
    if (error) { toast.error(friendlyError(error)); return; }
    setToken(data as string); load();
  }
  async function runTest() {
    setTesting(true);
    try { setTest(await testCrmConnection()); } catch (e) { setTest({ ok: false, error: String(e), inboxes: [] }); }
    setTesting(false);
  }
  async function addMap() {
    if (!newInbox.trim() || !newUnit) return;
    const { data: org } = await sb().from("organizations").select("id").limit(1).single();
    const { error } = await sb().from("crm_inbox_units").insert({ organization_id: org?.id, inbox_external_id: newInbox.trim(), unit_id: newUnit });
    if (error) toast.error(error.message.includes("duplicate") ? "Essa caixa de entrada já está mapeada." : friendlyError(error));
    else { setNewInbox(""); load(); }
  }
  const webhookUrl = token ? `${publicOrigin()}/api/public/crm/webhook/${token}` : null;

  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><h2 className="text-lg font-semibold">Status</h2>{status}</div>
          {failed > 0 && <span className="text-sm text-muted-foreground">{failed} evento(s) falharam nas últimas 24h</span>}
        </div>
        {pend.length > 0 && (
          <div className="mt-4 rounded-2xl bg-surface p-4 text-sm">
            <p className="font-medium">PENDENTE</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{pend.map((p) => <li key={p}>{p}</li>)}</ul>
            <p className="mt-2 text-xs text-muted-foreground">Enquanto estiver pendente, nada é enviado ao CRM: os eventos ficam na fila aguardando.</p>
          </div>
        )}
      </Panel>

      <Panel title="Conexão">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm"><span className="mb-1.5 block font-medium">URL base</span>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://crm.suaempresa.com.br" className="rounded-xl" /></label>
          <label className="block text-sm"><span className="mb-1.5 block font-medium">ID da conta</span>
            <Input value={acc} inputMode="numeric" onChange={(e) => setAcc(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 1" className="rounded-xl" /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm"><Switch checked={enabled} onCheckedChange={setEnabled} /> Integração ativa</label>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!rt.hasApiToken || !s.base_url || !s.account_id || testing} onClick={runTest}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Testar conexão"}
            </Button>
            <Button disabled={saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
          </div>
        </div>
        {!rt.hasApiToken && <p className="mt-3 text-xs text-muted-foreground">"Testar conexão" fica desabilitado até o secret TRYADE_CRM_API_TOKEN existir no servidor. O token nunca fica no banco nem no navegador.</p>}
        {test && (
          <div className="mt-3 rounded-2xl bg-surface p-3 text-sm">
            {test.ok ? <>Conexão OK. Caixas de entrada: {test.inboxes.map((i) => `${i.name} (#${i.id})`).join(", ") || "nenhuma"}</> : <>Falhou: {test.error}</>}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Assinatura HMAC do webhook: {rt.hasHmacSecret ? "ativa (TRYADE_CRM_WEBHOOK_HMAC_SECRET configurado)" : "não configurada (opcional)"}.</p>
      </Panel>

      <Panel title="Webhook de entrada">
        <p className="text-sm text-muted-foreground">
          {s.has_webhook_token ? `Token gerado em ${new Date(s.webhook_token_rotated_at!).toLocaleString("pt-BR")}. Por segurança só guardamos o hash: a URL completa aparece apenas no momento em que é gerada.` : "Nenhum token gerado ainda."}
        </p>
        {webhookUrl && (
          <div className="mt-3 flex gap-2">
            <Input readOnly value={webhookUrl} className="rounded-xl font-mono text-xs" />
            <Button variant="outline" size="icon" aria-label="Copiar URL" onClick={() => copy(webhookUrl)}><Copy className="h-4 w-4" /></Button>
          </div>
        )}
        {webhookUrl && <p className="mt-2 text-xs text-muted-foreground">Copie agora e cadastre no Chatwoot (Configurações → Integrações → Webhooks). Ela não será mostrada de novo.</p>}
        <Button variant="outline" className="mt-3" onClick={rotate}><RefreshCw className="h-4 w-4" /> {s.has_webhook_token ? "Rotacionar token" : "Gerar token"}</Button>
      </Panel>

      <Panel title="Caixa de entrada → unidade">
        <p className="mb-3 text-sm text-muted-foreground">Conversas que chegam por uma caixa de entrada mapeada ficam vinculadas à unidade.</p>
        <div className="space-y-2">
          {maps.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-2xl bg-surface px-4 py-2 text-sm">
              <span>Inbox #{m.inbox_external_id} → {units.find((u) => u.id === m.unit_id)?.name ?? "?"}</span>
              <Button variant="ghost" size="sm" onClick={async () => { const { error } = await sb().from("crm_inbox_units").delete().eq("id", m.id); if (error) toast.error(friendlyError(error)); else load(); }}>Remover</Button>
            </div>
          ))}
          {maps.length === 0 && <p className="text-sm text-muted-foreground">Nenhum mapeamento.</p>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {test?.inboxes.length ? (
            <NativeSelect value={newInbox} onChange={(e) => setNewInbox(e.target.value)}>
              <option value="">Caixa de entrada</option>
              {test.inboxes.map((i) => <option key={i.id} value={i.id}>{i.name} (#{i.id})</option>)}
            </NativeSelect>
          ) : (
            <Input value={newInbox} onChange={(e) => setNewInbox(e.target.value)} placeholder="ID da caixa de entrada" className="h-10 w-48 rounded-xl" />
          )}
          <NativeSelect value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
            <option value="">Unidade</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </NativeSelect>
          <Button variant="outline" disabled={!newInbox.trim() || !newUnit} onClick={addMap}>Adicionar</Button>
        </div>
      </Panel>
    </>
  );
}

type Key = { id: string; name: string; prefix: string; scopes: string[]; is_active: boolean; last_used_at: string | null; created_at: string };

const ENDPOINTS = [
  ["GET", "/units", "Unidades ativas, limites e horários"],
  ["GET", "/availability", "Horários com vaga (date) ou datas com vaga (from, to)"],
  ["POST", "/reservations", "Cria reserva (Idempotency-Key)"],
  ["GET", "/reservations", "Consulta pelo telefone (e protocolo)"],
  ["PATCH", "/reservations/{protocol}", "Alterar ou cancelar (exige telefone)"],
  ["POST", "/sac", "Abre SAC (Idempotency-Key)"],
  ["POST", "/conversations/classify", "Classifica a conversa"],
  ["POST", "/handoff", "Pede atendimento humano"],
  ["GET", "/openapi.json", "Especificação OpenAPI 3 (sem chave)"],
];

function SdrTab() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [name, setName] = useState("n8n SDR");
  const [writeScope, setWriteScope] = useState(true);
  const [created, setCreated] = useState<string | null>(null);
  const base = `${publicOrigin()}/api/public/sdr`;

  async function load() {
    const { data, error } = await sb().rpc("admin_list_api_keys");
    if (error) toast.error(friendlyError(error));
    setKeys((data ?? []) as Key[]);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    const { data, error } = await sb().rpc("admin_create_api_key", { _name: name, _scopes: writeScope ? ["read", "write"] : ["read"] });
    if (error) { toast.error(friendlyError(error)); return; }
    setCreated((data as { key: string }).key); load();
  }
  async function revoke(id: string) {
    if (!confirm("Revogar esta chave? O SDR que a usa para de funcionar na hora.")) return;
    await sb().rpc("admin_revoke_api_key", { _id: id }); load();
  }

  return (
    <>
      <Panel title="Chaves de API">
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 w-56 rounded-xl" aria-label="Nome da chave" />
          <label className="flex items-center gap-2 text-sm"><Switch checked={writeScope} onCheckedChange={setWriteScope} /> Pode criar e alterar</label>
          <Button onClick={create} disabled={name.trim().length < 2}>Criar chave</Button>
        </div>
        {created && (
          <div className="mt-4 rounded-2xl bg-surface p-4">
            <p className="text-sm font-medium">Copie agora: esta chave não será mostrada de novo.</p>
            <div className="mt-2 flex gap-2">
              <Input readOnly value={created} className="rounded-xl font-mono text-xs" />
              <Button variant="outline" size="icon" aria-label="Copiar chave" onClick={() => copy(created)}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
        <div className="mt-4 divide-y">
          {keys?.length === 0 && <p className="py-2 text-sm text-muted-foreground">Nenhuma chave criada.</p>}
          {keys?.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-medium">{k.name} <span className="font-mono text-xs text-muted-foreground">{k.prefix}…</span></p>
                <p className="text-xs text-muted-foreground">{k.scopes.join(", ")} · {k.last_used_at ? `usada em ${new Date(k.last_used_at).toLocaleString("pt-BR")}` : "nunca usada"}</p>
              </div>
              {k.is_active ? <Button variant="outline" size="sm" onClick={() => revoke(k.id)}>Revogar</Button> : <Pill tone="idle">Revogada</Pill>}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Endpoints">
        <p className="text-sm">OpenAPI para importar no n8n: <a className="underline" href="/api/public/sdr/openapi.json" target="_blank" rel="noreferrer">{base}/openapi.json</a></p>
        <div className="mt-3 divide-y text-sm">
          {ENDPOINTS.map(([m, p, d]) => (
            <div key={`${m}${p}`} className="flex gap-3 py-2"><span className="w-14 font-mono text-xs">{m}</span><span className="font-mono text-xs">{p}</span><span className="text-muted-foreground">{d}</span></div>
          ))}
        </div>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-surface p-4 text-xs">{`curl "${base}/availability?unit_slug=SLUG&date=2026-11-20&party_size=4" \\
  -H "Authorization: Bearer SUA_CHAVE"

curl -X POST "${base}/reservations" \\
  -H "Authorization: Bearer SUA_CHAVE" -H "Content-Type: application/json" \\
  -H "Idempotency-Key: conv-123-reserva-1" \\
  -d '{"unit_id":"UUID","date":"2026-11-20","time":"20:00","party_size":4,
       "full_name":"Nome Sobrenome","phone":"11987654321","conversation_external_id":"123"}'`}</pre>
      </Panel>
    </>
  );
}

type Ev = { id: string; direction: string; event_type: string; status: string; attempts: number; last_error: string | null; created_at: string; next_attempt_at: string; payload: Record<string, unknown> };
const QUEUE_LABEL: Record<string, string> = { pendente: "Pendente", processando: "Processando", enviado: "Concluído", falhou: "Falhou", cancelado: "Cancelado", entregue: "Entregue", lido: "Lido" };

function safePayload(p: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p ?? {})) {
    if (/phone/i.test(k)) out[k] = typeof v === "string" ? maskPhone(v) : v;
    else if (/name|reason/i.test(k)) out[k] = v ? "[oculto]" : v;
    else if (v && typeof v === "object") out[k] = safePayload(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

function QueueTab() {
  const [dir, setDir] = useState(""); const [st, setSt] = useState(""); const [type, setType] = useState("");
  const [rows, setRows] = useState<Ev[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setRows(null);
    let q = sb().from("crm_events").select("id,direction,event_type,status,attempts,last_error,created_at,next_attempt_at,payload")
      .order("created_at", { ascending: false }).limit(100);
    if (dir) q = q.eq("direction", dir);
    if (st) q = q.eq("status", st);
    if (type) q = q.eq("event_type", type);
    q.then(({ data }) => setRows((data ?? []) as Ev[]));
  }, [dir, st, type, tick]);

  async function act(id: string, patch: Record<string, unknown>, msg: string) {
    const { error } = await sb().from("crm_events").update(patch).eq("id", id);
    if (error) toast.error(friendlyError(error)); else { toast.success(msg); setTick((t) => t + 1); }
  }

  return (
    <Panel>
      <div className="flex flex-wrap gap-2">
        <NativeSelect value={dir} onChange={(e) => setDir(e.target.value)}><option value="">Entrada e saída</option><option value="inbound">Entrada</option><option value="outbound">Saída</option></NativeSelect>
        <NativeSelect value={st} onChange={(e) => setSt(e.target.value)}><option value="">Todos os status</option>{["pendente", "processando", "enviado", "falhou", "cancelado"].map((s) => <option key={s} value={s}>{QUEUE_LABEL[s]}</option>)}</NativeSelect>
        <NativeSelect value={type} onChange={(e) => setType(e.target.value)}><option value="">Todos os tipos</option>
          {[...OUTBOUND_TYPES, "conversation_created", "conversation_updated", "conversation_status_changed", "message_created", "contact_created", "contact_updated"].map((t) => <option key={t} value={t}>{t}</option>)}
        </NativeSelect>
        <Button variant="ghost" size="icon" aria-label="Atualizar" onClick={() => setTick((t) => t + 1)}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      <div className="mt-4 divide-y text-sm">
        {!rows && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {rows?.length === 0 && <p className="py-6 text-center text-muted-foreground">Nenhum evento na fila.</p>}
        {rows?.map((e) => (
          <div key={e.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button className="text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
                <p className="font-medium">{e.event_type} <span className="text-xs font-normal text-muted-foreground">· {e.direction === "inbound" ? "entrada" : "saída"}</span></p>
                <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")} · {e.attempts} tentativa(s){e.status === "pendente" && e.direction === "outbound" ? ` · próxima ${new Date(e.next_attempt_at).toLocaleTimeString("pt-BR")}` : ""}</p>
              </button>
              <div className="flex items-center gap-2">
                <Pill tone={e.status === "enviado" ? "ok" : e.status === "falhou" ? "err" : e.status === "pendente" ? "warn" : "idle"}>{QUEUE_LABEL[e.status] ?? e.status}</Pill>
                {e.direction === "outbound" && ["falhou", "cancelado"].includes(e.status) && (
                  <Button size="sm" variant="outline" onClick={() => act(e.id, { status: "pendente", attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null }, "Evento reenfileirado")}>Reprocessar</Button>
                )}
                {e.direction === "outbound" && e.status === "pendente" && (
                  <Button size="sm" variant="ghost" onClick={() => act(e.id, { status: "cancelado" }, "Evento cancelado")}>Cancelar</Button>
                )}
              </div>
            </div>
            {e.last_error && <p className="mt-1 text-xs text-destructive">{e.last_error}</p>}
            {open === e.id && <pre className="mt-2 overflow-x-auto rounded-2xl bg-surface p-3 text-xs">{JSON.stringify(safePayload(e.payload), null, 2)}</pre>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

type Conv = { id: string; external_id: string; classification: string | null; result: string | null; tags: string[]; status: string | null;
  message_count: number; last_message_at: string | null; handoff_at: string | null; units: { name: string } | null; summary: string | null };
const CLASS_LABEL: Record<string, string> = {
  interesse_reserva: "Interesse em reserva", reserva_realizada: "Reserva realizada", consulta_reserva: "Consulta de reserva",
  alteracao_reserva: "Alteração de reserva", cancelamento: "Cancelamento", sac_reclamacao: "SAC / reclamação", elogio: "Elogio",
  sugestao: "Sugestão", duvida_geral: "Dúvida geral", outros: "Outros", atendimento_humano: "Atendimento humano",
};

function ConversationsTab() {
  const [rows, setRows] = useState<Conv[] | null>(null);
  const [cls, setCls] = useState("");
  useEffect(() => {
    setRows(null);
    let q = sb().from("crm_conversations")
      .select("id,external_id,classification,result,tags,status,message_count,last_message_at,handoff_at,summary,units(name)")
      .order("updated_at", { ascending: false }).limit(100);
    if (cls) q = q.eq("classification", cls);
    q.then(({ data }) => setRows((data ?? []) as unknown as Conv[]));
  }, [cls]);
  return (
    <Panel>
      <NativeSelect value={cls} onChange={(e) => setCls(e.target.value)}>
        <option value="">Todas as classificações</option>
        {Object.entries(CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </NativeSelect>
      <div className="mt-4 overflow-x-auto">
        {!rows ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> :
          rows.length === 0 ? <p className="py-6 text-center text-muted-foreground">Nenhuma conversa registrada. Elas aparecem quando o CRM ou o SDR enviarem dados.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr className="border-b">
              {["Conversa", "Classificação", "Unidade", "Resultado", "Etiquetas", "Mensagens", "Última"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b last:border-0" title={c.summary ?? undefined}>
                  <td className="px-3 py-2 font-mono text-xs">#{c.external_id}{c.status && <span className="ml-1 text-muted-foreground">({c.status})</span>}</td>
                  <td className="px-3 py-2">{c.classification ? CLASS_LABEL[c.classification] : "—"}</td>
                  <td className="px-3 py-2">{c.units?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.result ?? "—"}</td>
                  <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="rounded-full bg-surface px-2 py-0.5 text-xs">{t}</span>)}</div></td>
                  <td className="px-3 py-2 tabular-nums">{c.message_count}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{c.last_message_at ? new Date(c.last_message_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
