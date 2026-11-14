import { createFileRoute } from "@tanstack/react-router";
import { scopedUnits } from "@/lib/scope";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Loader2, MessageCircle, Plus, RefreshCw, Search, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState, ListSkeleton, NativeSelect, StatCard } from "@/components/admin/bits";
import { useAuth } from "@/lib/auth";
import { sinceLabel } from "@/lib/crm";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import {
  barHeights, dayLabel, EVENT_REASON_LABEL, EVENT_STATUS_LABEL, HOOK_EXAMPLE, HOOK_FIELDS, hookUrl, parseEndpoints, parseHookEvents, parseWifiGuests, parseWifiOverview, pct, phoneLabel,
  type Endpoint, type HookEvent, type WifiGuest, type WifiOverview,
} from "@/lib/wifi";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/wifi")({
  head: () => ({ meta: [{ title: "Wi-Fi — Candeeiro Gestão" }, { name: "description", content: "Quem conecta no Wi-Fi do salão: visitas, cadastro e integração por webhook." }, { property: "og:title", content: "Wi-Fi — Candeeiro Gestão" }, { property: "og:description", content: "Visitantes do Wi-Fi e integração." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: WifiPage,
});

type Tab = "resumo" | "visitantes" | "integracao";
const TABS: { k: Tab; label: string }[] = [{ k: "resumo", label: "Resumo" }, { k: "visitantes", label: "Visitantes" }, { k: "integracao", label: "Integração" }];
type Unit = { id: string; name: string };

const notReady = (e: { message?: string; code?: string } | null) => !!e && (e.code === "PGRST202" || e.code === "42P01" || /could not find the function|does not exist|schema cache/i.test(e.message ?? ""));
const NOT_READY_MSG = "O Wi-Fi ainda não foi ativado neste ambiente. Peça para aplicar a atualização do banco (migração 016).";
const ERR: Record<string, string> = {
  INVALID_NAME: "Dê um nome com 2 a 80 letras.", INVALID_UNIT: "Unidade inválida.", LIMIT_REACHED: "Limite de 20 endereços atingido. Desative ou troque os que não usa.",
  INVALID_KIND: "Tipo inválido.", NOT_FOUND: "Endereço não encontrado.", INVALID_QUERY: "Busca muito longa.",
};
const errText = (e: { message?: string; code?: string }) => notReady(e) ? NOT_READY_MSG : ERR[Object.keys(ERR).find((k) => (e.message ?? "").includes(k)) ?? ""] ?? friendlyError(e);

function WifiPage() {
  const { roles } = useAuth();
  const allowed = roles.includes("super_admin") || roles.includes("gestor");
  const [tab, setTab] = useState<Tab>("resumo");
  const [units, setUnits] = useState<Unit[]>([]);
  useEffect(() => {
    if (!allowed) return;
    void scopedUnits("id,name").order("sort_order").order("name").then(({ data }) => setUnits((data ?? []) as Unit[]));
  }, [allowed]);
  if (!allowed) return <ErrorState message="Só gestores acessam esta área." />;
  return (
    <div className="fade-up">
      <h1 className="text-2xl font-semibold sm:text-4xl">Wi-Fi</h1>
      <p className="mt-1 text-sm text-muted-foreground">Quem conecta no Wi-Fi do salão. Os dados chegam do sistema de Wi-Fi por webhook e se cruzam com as reservas.</p>
      <div className="seg-scroll mt-5 flex gap-1 overflow-x-auto rounded-full bg-surface p-1" role="tablist">
        {TABS.map(({ k, label }) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("min-h-10 shrink-0 rounded-full px-4 text-sm transition", tab === k ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>{label}</button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "resumo" && <Resumo units={units} />}
        {tab === "visitantes" && <Visitantes units={units} />}
        {tab === "integracao" && <Integracao units={units} />}
      </div>
    </div>
  );
}

function Filters({ units, days, setDays, unit, setUnit }: { units: Unit[]; days: number; setDays: (n: number) => void; unit: string; setUnit: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <NativeSelect aria-label="Período" value={days} onChange={(e) => setDays(Number(e.target.value))}>
        <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option>
      </NativeSelect>
      {units.length > 1 && (
        <NativeSelect aria-label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">Todas as unidades</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </NativeSelect>
      )}
    </div>
  );
}

function Bars({ title, labels, values, tone }: { title: string; labels: string[]; values: number[]; tone: string }) {
  const h = barHeights(values);
  const total = values.reduce((a, b) => a + b, 0);
  const every = Math.ceil(values.length / 8);
  return (
    <figure className="rounded-2xl bg-card p-4 shadow-soft">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div role="img" aria-label={`${title}: ${total} no período`} className="mt-3 flex h-32 items-end gap-[3px]">
        {h.map((v, i) => (
          <div key={i} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${labels[i]}: ${values[i]}`}>
            <div className={cn("w-full rounded-t-[4px]", tone, v === 0 && "opacity-20")} style={{ height: `${Math.max(v, 3)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[10px] text-muted-foreground" aria-hidden="true">
        {labels.map((l, i) => <span key={i} className="min-w-0 flex-1 truncate text-center">{i % every === 0 ? l : ""}</span>)}
      </div>
    </figure>
  );
}

function Resumo({ units }: { units: Unit[] }) {
  const [days, setDays] = useState(30);
  const [unit, setUnit] = useState("");
  const [data, setData] = useState<WifiOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null); setData(null);
    const { data: d, error } = await requireSupabase().rpc("wifi_overview" as never, { _days: days, _unit: unit || null } as never);
    if (error) { setErr(errText(error)); return; }
    const parsed = parseWifiOverview(d);
    if (!parsed) { setErr("Resposta inesperada do servidor."); return; }
    setData(parsed);
  }, [days, unit]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <Filters units={units} days={days} setDays={setDays} unit={unit} setUnit={setUnit} />
      {err ? <ErrorState message={err} onRetry={load} /> : !data ? <ListSkeleton rows={3} /> : data.totals.visits === 0 ? (
        <EmptyState icon={Wifi} title="Nenhuma conexão no período" text="Quando o sistema de Wi-Fi começar a mandar os dados, eles aparecem aqui. Veja a aba Integração." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Conexões" value={data.totals.visits} />
            <StatCard label="Pessoas" value={data.totals.guests} hint={`${data.totals.new_guests} novas · ${data.totals.returning_guests} voltaram`} />
            <StatCard label="Com telefone" value={pct(data.totals.with_phone, data.totals.guests)} hint={`${data.totals.with_phone} pessoas`} />
            <StatCard label="Aceitam mensagens" value={pct(data.totals.with_consent, data.totals.guests)} hint={`${data.totals.with_consent} pessoas`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Já reservaram" value={data.totals.reserved} hint={`${pct(data.totals.reserved, data.totals.with_phone)} de quem tem telefone`} />
            <StatCard label="Reservaram depois de conectar" value={data.totals.reserved_after} hint="a primeira conexão veio antes da reserva" />
          </div>
          <Bars title="Conexões por dia" labels={data.by_day.map((d) => dayLabel(d.day))} values={data.by_day.map((d) => d.visits)} tone="bg-brand" />
          <Bars title="Conexões por horário" labels={data.by_hour.map((d) => `${d.hour}h`)} values={data.by_hour.map((d) => d.visits)} tone="bg-foreground/70" />
        </>
      )}
    </div>
  );
}

function Visitantes({ units }: { units: Unit[] }) {
  const [unit, setUnit] = useState("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<WifiGuest[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await requireSupabase().rpc("wifi_guests_list" as never, { _unit: unit || null, _q: term || null, _limit: 100 } as never);
    if (error) { setErr(errText(error)); setRows([]); return; }
    setRows(parseWifiGuests(data));
  }, [unit, term]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, telefone ou e-mail" aria-label="Buscar visitante" className="h-11 rounded-xl pl-9" />
        </div>
        {units.length > 1 && (
          <NativeSelect aria-label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">Todas as unidades</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </NativeSelect>
        )}
      </div>
      {err ? <ErrorState message={err} onRetry={load} /> : !rows ? <ListSkeleton /> : rows.length === 0 ? (
        <EmptyState icon={Wifi} title={term ? "Ninguém encontrado" : "Nenhum visitante ainda"} text={term ? "Tente outro nome ou número." : "Os visitantes aparecem aqui assim que o Wi-Fi mandar os dados."} />
      ) : (
        <ul className="space-y-2">
          {rows.map((g) => (
            <li key={g.id} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{g.name || g.email || phoneLabel(g.phone) || "Visitante sem nome"}</p>
                <p className="truncate text-xs text-muted-foreground">{[phoneLabel(g.phone), g.email, g.unit_name].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full bg-surface px-2 py-0.5">{g.visits} {g.visits === 1 ? "visita" : "visitas"}</span>
                  {g.consent && <span className="rounded-full bg-status-confirmed-bg px-2 py-0.5 text-status-confirmed">aceita mensagens</span>}
                  {g.reserved && <span className="rounded-full bg-surface px-2 py-0.5">já reservou</span>}
                  <span className="px-1 py-0.5 text-muted-foreground">última {sinceLabel(g.last_seen_at)}</span>
                </p>
              </div>
              {g.phone && g.consent && (
                <a href={`https://wa.me/${g.phone}`} target="_blank" rel="noopener noreferrer" aria-label={`Chamar ${g.name ?? "visitante"} no WhatsApp`}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-foreground hover:bg-sidebar-accent"><MessageCircle className="h-5 w-5" /></a>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Só quem aceitou receber mensagens recebe campanhas e tem o botão de WhatsApp. Os demais aparecem apenas nos números.</p>
    </div>
  );
}

type Secret = { name: string; url: string; rotated: boolean };

function Integracao({ units }: { units: Unit[] }) {
  const { roles } = useAuth();
  const isSuper = roles.includes("super_admin");
  const [list, setList] = useState<Endpoint[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [events, setEvents] = useState<Endpoint | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await requireSupabase().rpc("webhook_endpoints_list" as never);
    if (error) { setErr(errText(error)); setList([]); return; }
    setList(parseEndpoints(data));
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function toggle(e: Endpoint): Promise<void> {
    const { error } = await requireSupabase().rpc("webhook_endpoint_set_active" as never, { _id: e.id, _active: !e.is_active } as never);
    if (error) { toast.error(errText(error)); return; }
    toast.success(e.is_active ? "Endereço desativado: o Wi-Fi para de ser aceito" : "Endereço reativado");
    void load();
  }
  async function rotate(e: Endpoint): Promise<void> {
    if (!window.confirm(`Trocar o endereço de “${e.name}”?\n\nO endereço antigo para de funcionar na hora. Você precisa colar o novo no sistema de Wi-Fi.`)) return;
    const { data, error } = await requireSupabase().rpc("webhook_endpoint_rotate" as never, { _id: e.id } as never);
    const token = (data as { token?: string } | null)?.token;
    if (error || !token) { toast.error(error ? errText(error) : "Não foi possível trocar."); return; }
    setSecret({ name: e.name, url: hookUrl(window.location.origin, token), rotated: true });
    void load();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card p-4 shadow-soft">
        <p className="font-medium">Como ligar o sistema de Wi-Fi</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Crie um endereço abaixo (um por unidade) e copie o link que aparece.</li>
          <li>No sistema de Wi-Fi, cadastre esse link como <strong className="text-foreground">webhook</strong> de “cliente conectou” (método POST, formato JSON).</li>
          <li>Conecte um celular no Wi-Fi. Em segundos ele aparece em “Últimos recebidos”.</li>
        </ol>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">Campos que o painel entende</summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {HOOK_FIELDS.map((f) => <li key={f.field}><strong className="text-foreground">{f.field}:</strong> <span className="font-mono text-xs">{f.names}</span></li>)}
          </ul>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-surface p-3 text-xs">{HOOK_EXAMPLE}</pre>
          <p className="mt-2 text-xs text-muted-foreground">Se o sistema usar outros nomes, abra “Últimos recebidos”, veja o que chegou e avise para ajustarmos.</p>
        </details>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Endereços</h2>
        <Button className="h-11" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Novo endereço</Button>
      </div>

      {err ? <ErrorState message={err} onRetry={load} /> : !list ? <ListSkeleton rows={2} /> : list.length === 0 ? (
        <EmptyState icon={Wifi} title="Nenhum endereço criado" text="Crie o primeiro para receber os dados do Wi-Fi." action={<Button className="h-11" onClick={() => setCreating(true)}>Novo endereço</Button>} />
      ) : (
        <ul className="space-y-2">
          {list.map((e) => (
            <li key={e.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.unit_name ?? "Rede toda"} · termina em <span className="font-mono">…{e.token_hint}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.last_event_at ? `Último recebido ${sinceLabel(e.last_event_at)}` : "Ainda não recebeu nada"} · {e.events_24h} nas últimas 24 h · {e.events_7d} em 7 dias
                  </p>
                  {e.errors_7d > 0 && <p className="mt-1 text-xs font-medium text-destructive">{e.errors_7d} com erro nos últimos 7 dias</p>}
                  {e.ignored_7d > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{e.ignored_7d} ignorados por falta de telefone, e-mail ou aparelho</p>}
                </div>
                <Switch checked={e.is_active} onCheckedChange={() => void toggle(e)} aria-label={`${e.name} ativo`} className="mt-1" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11" onClick={() => setEvents(e)}>Últimos recebidos</Button>
                <Button variant="outline" className="h-11" onClick={() => void rotate(e)}><RefreshCw className="h-4 w-4" /> Trocar endereço</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateSheet open={creating} onOpenChange={setCreating} units={units} isSuper={isSuper} onCreated={(s) => { setSecret(s); void load(); }} />
      <SecretSheet secret={secret} onClose={() => setSecret(null)} />
      <EventsSheet endpoint={events} onClose={() => setEvents(null)} />
    </div>
  );
}

function CreateSheet({ open, onOpenChange, units, isSuper, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; units: Unit[]; isSuper: boolean; onCreated: (s: Secret) => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(""); setUnit(units.length === 1 ? units[0]!.id : ""); setMsg(null); } }, [open, units]);
  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setMsg(null);
    if (!unit && !isSuper) { setMsg("Escolha a unidade."); return; }
    setBusy(true);
    const { data, error } = await requireSupabase().rpc("webhook_endpoint_create" as never, { _name: name, _unit: unit || null, _kind: "wifi" } as never);
    setBusy(false);
    const token = (data as { token?: string } | null)?.token;
    if (error || !token) { setMsg(error ? errText(error) : "Não foi possível criar."); return; }
    onOpenChange(false);
    onCreated({ name: name.trim(), url: hookUrl(window.location.origin, token), rotated: false });
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-lg overflow-y-auto rounded-3xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
        <SheetHeader className="text-left"><SheetTitle>Novo endereço do Wi-Fi</SheetTitle></SheetHeader>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="space-y-1.5"><Label htmlFor="wh-name">Nome</Label>
            <Input id="wh-name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Wi-Fi Goiânia" className="h-12 rounded-xl" /></div>
          <div className="flex flex-col gap-1.5 [&>*:last-child]:w-full"><Label htmlFor="wh-unit">Unidade</Label>
            <NativeSelect id="wh-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {isSuper && <option value="">Rede toda (descobre pela unidade que o Wi-Fi informar)</option>}
              {!isSuper && units.length !== 1 && <option value="">Escolha…</option>}
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </NativeSelect></div>
          {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
          <Button type="submit" className="h-12 w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar endereço"}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function SecretSheet({ secret, onClose }: { secret: Secret | null; onClose: () => void }) {
  async function copy(): Promise<void> {
    if (!secret) return;
    try { await navigator.clipboard.writeText(secret.url); toast.success("Endereço copiado"); }
    catch { toast.error("Não consegui copiar. Segure o texto para selecionar e copiar."); }
  }
  return (
    <Sheet open={!!secret} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-lg overflow-y-auto rounded-3xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
        {secret && (
          <>
            <SheetHeader className="text-left"><SheetTitle>{secret.rotated ? "Novo endereço" : "Endereço criado"}: {secret.name}</SheetTitle></SheetHeader>
            <p className="mt-2 text-sm text-muted-foreground">Copie agora e cole no sistema de Wi-Fi como webhook. <strong className="text-foreground">Por segurança este endereço não aparece de novo</strong> — se perder, é só trocar por um novo.</p>
            <Input readOnly value={secret.url} aria-label="Endereço do webhook" className="mt-4 h-12 rounded-xl font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button className="mt-3 h-12 w-full" onClick={copy}><Copy className="h-4 w-4" /> Copiar endereço</Button>
            <Button variant="outline" className="mt-2 h-12 w-full" onClick={onClose}>Já copiei</Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EventsSheet({ endpoint, onClose }: { endpoint: Endpoint | null; onClose: () => void }) {
  const [rows, setRows] = useState<HookEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const id = endpoint?.id;
  const load = useCallback(async () => {
    if (!id) return;
    setErr(null); setRows(null);
    const { data, error } = await requireSupabase().rpc("webhook_events_recent" as never, { _endpoint: id, _limit: 20 } as never);
    if (error) { setErr(errText(error)); return; }
    setRows(parseHookEvents(data));
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  const pretty = useMemo(() => (p: unknown) => { try { return JSON.stringify(p, null, 2); } catch { return String(p); } }, []);
  return (
    <Sheet open={!!endpoint} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto flex max-h-[92dvh] max-w-lg flex-col rounded-3xl p-0">
        <SheetHeader className="border-b px-4 pb-3 pt-5 text-left">
          <SheetTitle className="truncate pr-10">Últimos recebidos · {endpoint?.name}</SheetTitle>
          <p className="text-xs text-muted-foreground">Guardados por 30 dias. Contêm dados pessoais: não compartilhe.</p>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {err ? <ErrorState message={err} onRetry={load} /> : !rows ? <ListSkeleton rows={3} /> : rows.length === 0 ? (
            <EmptyState icon={Wifi} title="Nada recebido ainda" text="Conecte um celular no Wi-Fi e atualize." action={<Button variant="outline" className="h-11" onClick={load}>Atualizar</Button>} />
          ) : rows.map((e) => (
            <details key={e.id} className="rounded-2xl bg-surface p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-sm">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", e.status === "processado" ? "bg-status-confirmed-bg text-status-confirmed" : e.status === "erro" ? "bg-status-noshow-bg text-status-noshow" : "bg-background")}>{EVENT_STATUS_LABEL[e.status]}</span>
                <span className="text-xs text-muted-foreground">{sinceLabel(e.received_at)}{e.error ? ` · ${EVENT_REASON_LABEL[e.error] ?? e.error}` : ""}</span>
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs">{pretty(e.payload)}</pre>
            </details>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
