import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Headset, Loader2, MessageCircle, Phone, Plus, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, ListSkeleton, NativeSelect } from "@/components/admin/bits";
import { actorLabel, actionLabel, timeLabel } from "@/lib/audit";
import { COMPLAINT_TYPES, ORIGIN, PRIORITY, SAC_STATUS, SLA, sacError, sacStatusLabel, typeLabel, type SacPriority, type SacStatus } from "@/lib/sac";
import { friendlyError, requireSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/sac")({
  head: () => ({ meta: [{ title: "SAC — Candeeiro Gestão" }, { name: "description", content: "Reclamações e atendimentos ao cliente da Rede Candeeiro." }, { property: "og:title", content: "SAC — Candeeiro Gestão" }, { property: "og:description", content: "Reclamações e atendimentos ao cliente." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Sac,
});

type Ticket = { id: string; protocol: string; unit_id: string | null; unit_name: string | null; status: SacStatus; category: string; complaint_type: string | null; priority: SacPriority; subject: string; origin: string | null; opened_at: string; due_at: string; resolved_at: string | null; assigned_to: string | null; assignee_name: string | null; customer_name: string | null; customer_phone: string | null; sla_state: string; reopened_count: number; total: number };
type Stats = { opened_today: number; open: number; overdue: number; avg_first_response_h: number | null; avg_resolution_h: number | null; top_types: { k: string; n: number }[]; recurrent_customers: number };
type F = { unit: string; type: string; priority: string; assignee: string; origin: string; from: string; to: string; overdue: boolean };
const EMPTY: F = { unit: "", type: "", priority: "", assignee: "", origin: "", from: "", to: "", overdue: false };
const waLink = (p: string) => `https://wa.me/${p.replace(/\D/g, "")}`;

function Sac() {
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([]);
  const [f, setF] = useState<F>(EMPTY);
  const [q, setQ] = useState("");
  const [qa, setQa] = useState("");
  const [rows, setRows] = useState<Ticket[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const sb = requireSupabase();
    sb.from("units").select("id,name").order("sort_order").order("name").then(({ data }) => setUnits((data ?? []) as typeof units));
  }, []);
  useEffect(() => {
    const u = f.unit || units[0]?.id;
    if (!u) return;
    requireSupabase().rpc("sac_team_for_unit", { _unit: u }).then(({ data }) => setPeople((data ?? []) as typeof people));
  }, [f.unit, units]);

  useEffect(() => {
    let cancel = false;
    const sb = requireSupabase();
    setErr(null);
    Promise.all([
      sb.rpc("sac_list", {
        _unit: f.unit || null, _type: f.type || null, _priority: (f.priority || null) as SacPriority | null, _assignee: f.assignee || null,
        _origin: f.origin || null, _from: f.from || null, _to: f.to || null, _overdue: f.overdue, _q: qa || null, _limit: 200,
      }),
      sb.rpc("sac_stats", { _unit: f.unit || null }),
    ]).then(([l, s]) => {
      if (cancel) return;
      if (l.error) { setErr(friendlyError(l.error)); setRows([]); return; }
      setRows((l.data ?? []) as Ticket[]);
      setStats((s.data ?? null) as Stats | null);
    });
    return () => { cancel = true; };
  }, [f, qa, tick]);

  useEffect(() => {
    const sb = requireSupabase();
    const ch = sb.channel("sac-tickets").on("postgres_changes", { event: "*", schema: "public", table: "sac_tickets" }, () => reload()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [reload]);

  const active = useMemo(() => Object.entries(f).filter(([, v]) => v).length, [f]);
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((p) => ({ ...p, [k]: v }));
  const grouped = useMemo(() => SAC_STATUS.map((s) => ({ ...s, items: (rows ?? []).filter((r) => r.status === s.k) })), [rows]);

  const filters = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Fld id="s-unit" label="Unidade"><NativeSelect id="s-unit" value={f.unit} onChange={(e) => set("unit", e.target.value)}><option value="">Todas</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></Fld>
      <Fld id="s-type" label="Tipo"><NativeSelect id="s-type" value={f.type} onChange={(e) => set("type", e.target.value)}><option value="">Todos</option>{Object.entries(COMPLAINT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Fld>
      <Fld id="s-pri" label="Prioridade"><NativeSelect id="s-pri" value={f.priority} onChange={(e) => set("priority", e.target.value)}><option value="">Todas</option>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Fld>
      <Fld id="s-ass" label="Responsável"><NativeSelect id="s-ass" value={f.assignee} onChange={(e) => set("assignee", e.target.value)}><option value="">Todos</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</NativeSelect></Fld>
      <Fld id="s-ori" label="Origem"><NativeSelect id="s-ori" value={f.origin} onChange={(e) => set("origin", e.target.value)}><option value="">Todas</option><option value="sdr_whatsapp">WhatsApp (SDR)</option><option value="telefone">Telefone</option><option value="presencial">Presencial</option><option value="site">Site</option></NativeSelect></Fld>
      <Fld id="s-from" label="De"><Input id="s-from" type="date" value={f.from} onChange={(e) => set("from", e.target.value)} className="h-11 rounded-xl" /></Fld>
      <Fld id="s-to" label="Até"><Input id="s-to" type="date" value={f.to} onChange={(e) => set("to", e.target.value)} className="h-11 rounded-xl" /></Fld>
      <div className="flex items-end gap-2">
        <label htmlFor="s-over" className="flex min-h-11 flex-1 items-center gap-2 text-sm"><Checkbox id="s-over" checked={f.overdue} onCheckedChange={(v) => set("overdue", v === true)} /> Só atrasados</label>
        <Button variant="ghost" className="h-11" disabled={!active} onClick={() => setF(EMPTY)}>Limpar</Button>
      </div>
    </div>
  );

  return (
    <div className="fade-up">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h1 className="truncate text-2xl font-semibold sm:text-4xl">SAC</h1>
        <Button className="h-11" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Novo chamado</Button>
      </div>

      {stats && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Abertos hoje" v={stats.opened_today} />
          <Kpi label="Atrasados" v={stats.overdue} alert={stats.overdue > 0} onClick={() => set("overdue", true)} />
          <Kpi label="1ª resposta (média)" v={stats.avg_first_response_h == null ? "—" : `${stats.avg_first_response_h} h`} />
          <Kpi label="Resolução (média)" v={stats.avg_resolution_h == null ? "—" : `${stats.avg_resolution_h} h`} />
          <Kpi label="Mais comum" v={stats.top_types[0] ? typeLabel(stats.top_types[0].k) : "—"} />
          <Kpi label="Clientes reincidentes" v={stats.recurrent_customers} />
        </div>
      )}

      <form className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:grid-cols-[minmax(0,1fr)]" onSubmit={(e) => { e.preventDefault(); setQa(q); }}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Buscar por protocolo, nome ou telefone" placeholder="Protocolo, nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setQa(q)} className="h-11 rounded-xl pl-9" />
        </div>
        <Button type="button" variant="outline" className="h-11 md:hidden" onClick={() => setSheet(true)}><SlidersHorizontal className="h-4 w-4" /> Filtrar{active ? ` (${active})` : ""}</Button>
      </form>
      <div className="mt-4 hidden md:block">{filters}</div>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 md:hidden">
          <SheetHeader className="text-left"><SheetTitle>Filtros</SheetTitle></SheetHeader>
          <div className="mt-4">{filters}</div>
          <Button className="mt-4 h-12 w-full" onClick={() => setSheet(false)}>Ver chamados</Button>
        </SheetContent>
      </Sheet>

      <div className="mt-5">
        {err ? <ErrorState message={err} onRetry={reload} />
          : !rows ? <ListSkeleton />
          : rows.length === 0 ? <EmptyState icon={Headset} title="Nenhum chamado" text={active || qa ? "Tente outros filtros." : "Quando um cliente reclamar, o chamado aparece aqui."} action={<Button className="h-11" onClick={() => setCreating(true)}>Novo chamado</Button>} />
          : (
            <>
              {/* celular: grupos empilhados */}
              <div className="space-y-5 lg:hidden">
                {grouped.filter((g) => g.items.length).map((g) => (
                  <section key={g.k}>
                    <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">{g.label}<span className="text-muted-foreground">{g.items.length}</span></h2>
                    <ul className="space-y-2">{g.items.map((t) => <li key={t.id}><TicketCard t={t} onOpen={() => setOpenId(t.id)} /></li>)}</ul>
                  </section>
                ))}
              </div>
              {/* computador: quadro */}
              <div className="hidden gap-3 lg:grid lg:grid-cols-5">
                {grouped.map((g) => (
                  <section key={g.k} className="min-w-0 rounded-2xl bg-surface p-2">
                    <h2 className="flex items-center justify-between px-2 py-1 text-sm font-semibold">{g.label}<span className="text-muted-foreground">{g.items.length}</span></h2>
                    <ul className="mt-1 space-y-2">{g.items.map((t) => <li key={t.id}><TicketCard t={t} compact onOpen={() => setOpenId(t.id)} /></li>)}</ul>
                  </section>
                ))}
              </div>
            </>
          )}
      </div>

      <TicketSheet id={openId} onClose={() => setOpenId(null)} onChanged={reload} />
      <NewTicketSheet open={creating} onOpenChange={setCreating} units={units} onCreated={(id) => { reload(); setOpenId(id); }} />
    </div>
  );
}

function Kpi({ label, v, alert, onClick }: { label: string; v: React.ReactNode; alert?: boolean; onClick?: () => void }) {
  const C = onClick ? "button" : "div";
  return (
    <C type={onClick ? "button" : undefined} onClick={onClick} className={`min-h-16 rounded-2xl p-3 text-left shadow-soft ${alert ? "bg-status-cancelled-bg" : "bg-card"}`}>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-semibold ${alert ? "text-status-cancelled" : ""}`}>{v}</p>
    </C>
  );
}

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}

function TicketCard({ t, onOpen, compact }: { t: Ticket; onOpen: () => void; compact?: boolean }) {
  const open = t.status !== "resolvido" && t.status !== "encerrado";
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-2xl border bg-card p-3 text-left shadow-soft">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip className={SAC_STATUS.find((s) => s.k === t.status)?.chip ?? ""}>{sacStatusLabel(t.status)}</Chip>
        {open && <Chip className={SLA[t.sla_state]?.chip ?? ""}>{SLA[t.sla_state]?.label}</Chip>}
        {(t.priority === "alta" || t.priority === "urgente") && <Chip className="bg-status-cancelled-bg text-status-cancelled">{PRIORITY[t.priority]}</Chip>}
      </div>
      <p className="mt-2 line-clamp-2 break-words text-sm font-semibold">{t.subject}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.customer_name ?? "Cliente"} · {typeLabel(t.complaint_type, t.category)}</p>
      {!compact && <p className="truncate text-xs text-muted-foreground">{t.unit_name ?? "Sem unidade"} · {ORIGIN[t.origin ?? "painel"] ?? t.origin}</p>}
      <p className="mt-1 truncate text-xs text-muted-foreground">{t.protocol} · {t.assignee_name ? `com ${t.assignee_name}` : "sem responsável"}</p>
    </button>
  );
}

type Detail = { id: string; protocol: string; unit_id: string | null; unit_name: string | null; status: SacStatus; category: string; complaint_type: string | null; priority: SacPriority; subject: string; description: string | null; origin: string | null; opened_at: string; due_effective: string; resolution: string | null; resolved_at: string | null; assigned_to: string | null; assignee_name: string | null; reopened_count: number; customer: { full_name: string; phone: string; tickets: number } | null; reservation: { id: string; protocol: string; date: string; time: string } | null };
type Tl = { id: string; created_at: string; kind: string; event_type: string | null; body: string | null; author_name: string | null; from_status: string | null; to_status: string | null; action: string | null; source: string | null; actor_role: string | null };

const EVENT_LABEL: Record<string, string> = { aberto: "Chamado aberto", status: "Status alterado", prioridade: "Prioridade alterada", categoria: "Tipo alterado", prazo: "Prazo alterado", responsavel: "Responsável alterado", resolvido: "Resolvido", reaberto: "Reaberto", nota: "Nota interna", contato: "Contato com o cliente", atendimento_humano: "Pediu atendimento humano" };

function TicketSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [tl, setTl] = useState<Tl[]>([]);
  const [team, setTeam] = useState<{ id: string; full_name: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<null | "resolve" | "close" | "reopen" | "note" | "contact">(null);
  const [text, setText] = useState("");
  const [channel, setChannel] = useState("telefone");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!id) { setD(null); return; }
    let cancel = false;
    const sb = requireSupabase();
    setErr(null);
    Promise.all([sb.rpc("sac_get", { _id: id }), sb.rpc("sac_timeline", { _id: id })]).then(([g, t]) => {
      if (cancel) return;
      if (g.error) { setErr(friendlyError(g.error)); return; }
      const det = g.data as Detail;
      setD(det);
      setTl((t.data ?? []) as Tl[]);
      sb.rpc("sac_team_for_unit", { _unit: det.unit_id }).then(({ data }) => !cancel && setTeam((data ?? []) as typeof team));
    });
    return () => { cancel = true; };
  }, [id, tick]);

  async function run(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) { toast.error(sacError(error.message)); return false; }
    toast.success(ok);
    setTick((n) => n + 1);
    onChanged();
    return true;
  }
  const sb = () => requireSupabase();
  const patch = (p: Record<string, unknown>, ok: string) => run("patch", () => sb().rpc("sac_update", { _id: d!.id, _patch: p }), ok);
  const closed = d && (d.status === "resolvido" || d.status === "encerrado");

  async function submitMode() {
    if (!d || !mode) return;
    const t = text.trim();
    const map = {
      resolve: () => run("m", () => sb().rpc("sac_resolve", { _id: d.id, _resolution: t }), "Chamado resolvido"),
      close: () => run("m", () => sb().rpc("sac_update", { _id: d.id, _patch: { status: "encerrado", resolution: t } }), "Fechado sem solução"),
      reopen: () => run("m", () => sb().rpc("sac_reopen", { _id: d.id, _reason: t }), "Chamado reaberto"),
      note: () => run("m", () => sb().rpc("sac_add_note", { _id: d.id, _body: t }), "Nota registrada"),
      contact: () => run("m", () => sb().rpc("sac_register_contact", { _id: d.id, _channel: channel, _summary: t }), "Contato registrado"),
    } as const;
    if (await map[mode]()) { setMode(null); setText(""); }
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto flex max-h-[94dvh] max-w-2xl flex-col rounded-t-3xl p-0">
        <SheetHeader className="border-b px-4 pb-3 pt-5 text-left">
          <SheetTitle className="pr-10 text-base">{d ? d.subject : "Chamado"}</SheetTitle>
          {d && <p className="text-xs text-muted-foreground">{d.protocol} · {d.unit_name ?? "Sem unidade"} · {ORIGIN[d.origin ?? "painel"] ?? d.origin} · aberto {timeLabel(d.opened_at)}</p>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {err ? <ErrorState message={err} onRetry={() => setTick((n) => n + 1)} /> : !d ? <ListSkeleton rows={3} /> : (
            <div className="space-y-5">
              {d.customer && (
                <section className="rounded-2xl bg-surface p-3">
                  <p className="font-semibold">{d.customer.full_name}</p>
                  <p className="text-xs text-muted-foreground">{d.customer.phone}{d.customer.tickets > 1 ? ` · ${d.customer.tickets} chamados` : ""}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button asChild variant="outline" className="h-11"><a href={`tel:${d.customer.phone}`}><Phone className="h-4 w-4" /> Ligar</a></Button>
                    <Button asChild variant="outline" className="h-11"><a href={waLink(d.customer.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a></Button>
                  </div>
                </section>
              )}
              {d.reservation && <p className="text-sm">Reserva: <a className="font-medium underline" href={`/admin/reservas?id=${d.reservation.id}`}>{d.reservation.protocol}</a> · {d.reservation.date.split("-").reverse().join("/")} {d.reservation.time.slice(0, 5)}</p>}
              {d.description && <p className="whitespace-pre-wrap break-words text-sm">{d.description}</p>}
              {d.resolution && <p className="rounded-xl bg-status-confirmed-bg p-3 text-sm text-status-confirmed">Resolução: {d.resolution}</p>}

              <section className="grid grid-cols-2 gap-3">
                <Fld id="t-status" label="Status">
                  <NativeSelect id="t-status" value={d.status} disabled={!!closed || busy === "patch"} onChange={(e) => {
                    const v = e.target.value; if (v === "resolvido") { setMode("resolve"); return; } if (v === "encerrado") { setMode("close"); return; } patch({ status: v }, "Status alterado");
                  }}>{SAC_STATUS.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}</NativeSelect>
                </Fld>
                <Fld id="t-pri" label="Prioridade"><NativeSelect id="t-pri" value={d.priority} disabled={busy === "patch"} onChange={(e) => patch({ priority: e.target.value }, "Prioridade alterada")}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Fld>
                <Fld id="t-type" label="Tipo"><NativeSelect id="t-type" value={d.complaint_type ?? ""} disabled={busy === "patch"} onChange={(e) => patch({ complaint_type: e.target.value }, "Tipo alterado")}><option value="">{typeLabel(null, d.category)}</option>{Object.entries(COMPLAINT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Fld>
                <Fld id="t-ass" label="Responsável"><NativeSelect id="t-ass" value={d.assigned_to ?? ""} disabled={busy === "patch"} onChange={(e) => patch({ assigned_to: e.target.value }, "Responsável alterado")}><option value="">Ninguém</option>{team.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</NativeSelect></Fld>
                <div className="col-span-2">
                  <Fld id="t-due" label="Prazo">
                    <Input id="t-due" type="datetime-local" className="h-11 rounded-xl" disabled={!!closed} defaultValue={toLocalInput(d.due_effective)} key={d.due_effective}
                      onBlur={(e) => { if (e.target.value && e.target.value !== toLocalInput(d.due_effective)) patch({ due_at: new Date(e.target.value).toISOString() }, "Prazo alterado"); }} />
                  </Fld>
                  {!closed && <p className="mt-1 text-xs"><Chip className={dueChip(d.due_effective, d.opened_at).chip}>{dueChip(d.due_effective, d.opened_at).label}</Chip></p>}
                </div>
              </section>

              {mode && (
                <section className="rounded-2xl border p-3">
                  <p className="text-sm font-medium">{{ resolve: "Como foi resolvido?", close: "Por que ficou sem solução?", reopen: "Motivo para reabrir", note: "Nota interna (só a equipe vê)", contact: "Contato com o cliente" }[mode]}</p>
                  {mode === "contact" && <NativeSelect aria-label="Canal" className="mt-2" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="telefone">Telefone</option><option value="whatsapp">WhatsApp</option><option value="presencial">Presencial</option><option value="email">E-mail</option></NativeSelect>}
                  <Textarea aria-label="Texto" className="mt-2 rounded-xl" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder={mode === "contact" ? "Resumo da conversa" : ""} />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button variant="ghost" className="h-11" onClick={() => { setMode(null); setText(""); }}>Voltar</Button>
                    <Button className="h-11" disabled={text.trim().length < 3 || busy === "m"} onClick={submitMode}>{busy === "m" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-sm font-medium">Linha do tempo</h3>
                <ol className="mt-2 space-y-2 border-l pl-4">
                  {tl.map((e) => (
                    <li key={e.id} className="text-sm">
                      {e.kind === "evento" ? (
                        <>
                          <p className="font-medium">{EVENT_LABEL[e.event_type ?? ""] ?? e.event_type}{e.from_status && e.to_status ? `: ${sacStatusLabel(e.from_status)} → ${sacStatusLabel(e.to_status)}` : ""}</p>
                          {e.body && <p className="whitespace-pre-wrap break-words text-muted-foreground">{e.body}</p>}
                          <p className="text-xs text-muted-foreground">{timeLabel(e.created_at)} · {e.author_name ?? (e.event_type === "atendimento_humano" || e.event_type === "aberto" ? "Atendente do WhatsApp / sistema" : "Sistema")}</p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">{actorLabel({ actor_name: e.author_name, actor_role: e.actor_role, source: e.source ?? "sistema" })} {actionLabel(e.action ?? "")} · {timeLabel(e.created_at)}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          )}
        </div>
        {d && !mode && (
          <footer className="grid grid-cols-3 gap-2 border-t px-4 pt-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
            <Button variant="outline" className="h-12 px-2 text-sm" onClick={() => setMode("contact")}>Contato</Button>
            <Button variant="outline" className="h-12 px-2 text-sm" onClick={() => setMode("note")}>Nota</Button>
            {closed ? <Button className="h-12 px-2 text-sm" onClick={() => setMode("reopen")}>Reabrir</Button>
              : <Button variant="success" className="h-12 px-2 text-sm" onClick={() => setMode("resolve")}>Resolver</Button>}
          </footer>
        )}
      </SheetContent>
    </Sheet>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function dueChip(due: string, opened: string) {
  const now = Date.now(), d = new Date(due).getTime(), o = new Date(opened).getTime();
  if (now > d) return SLA["atrasado"]!;
  if (now > d - (d - o) * 0.25) return SLA["vence_em_breve"]!;
  return SLA["no_prazo"]!;
}

function NewTicketSheet({ open, onOpenChange, units, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; units: { id: string; name: string }[]; onCreated: (id: string) => void }) {
  const [unit, setUnit] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("atendimento");
  const [priority, setPriority] = useState<SacPriority>("media");
  const [channel, setChannel] = useState("telefone");
  const [subject, setSubject] = useState("");
  const [desc, setDesc] = useState("");
  const [res, setRes] = useState("");
  const [assignee, setAssignee] = useState("");
  const [team, setTeam] = useState<{ id: string; full_name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (open) { setUnit(units.length === 1 ? units[0]!.id : ""); setName(""); setPhone(""); setSubject(""); setDesc(""); setRes(""); setAssignee(""); setMsg(null); } }, [open, units]);
  useEffect(() => { if (unit) requireSupabase().rpc("sac_team_for_unit", { _unit: unit }).then(({ data }) => setTeam((data ?? []) as typeof team)); }, [unit]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!unit) { setMsg("Escolha a unidade."); return; }
    setBusy(true);
    const { data, error } = await requireSupabase().rpc("sac_create_manual", {
      _unit_id: unit, _full_name: name, _phone: phone, _complaint_type: type, _category: "reclamacao", _priority: priority,
      _subject: subject, _description: desc, _channel: channel, _reservation_protocol: res || null, _assigned_to: assignee || null,
    });
    setBusy(false);
    if (error) { setMsg(sacError(error.message)); return; }
    const r = data as { id: string; protocol: string };
    toast.success(`Chamado ${r.protocol} criado`);
    onOpenChange(false);
    onCreated(r.id);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[94dvh] max-w-lg overflow-y-auto rounded-t-3xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
        <SheetHeader className="text-left"><SheetTitle>Novo chamado</SheetTitle></SheetHeader>
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <Fld id="n-unit" label="Unidade"><NativeSelect id="n-unit" required value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">Escolha</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></Fld>
          <div className="grid grid-cols-2 gap-3">
            <Fld id="n-name" label="Nome do cliente"><Input id="n-name" required value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" /></Fld>
            <Fld id="n-phone" label="Telefone"><Input id="n-phone" required type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl" /></Fld>
            <Fld id="n-type" label="Tipo"><NativeSelect id="n-type" value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(COMPLAINT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Fld>
            <Fld id="n-pri" label="Prioridade"><NativeSelect id="n-pri" value={priority} onChange={(e) => setPriority(e.target.value as SacPriority)}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Fld>
            <Fld id="n-ch" label="Como chegou"><NativeSelect id="n-ch" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="telefone">Telefone</option><option value="presencial">Presencial</option><option value="site">Site</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option></NativeSelect></Fld>
            <Fld id="n-ass" label="Responsável"><NativeSelect id="n-ass" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Ninguém</option>{team.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</NativeSelect></Fld>
          </div>
          <Fld id="n-sub" label="Assunto"><Input id="n-sub" required minLength={3} maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} className="h-11 rounded-xl" /></Fld>
          <Fld id="n-desc" label="O que aconteceu"><Textarea id="n-desc" maxLength={2000} value={desc} onChange={(e) => setDesc(e.target.value)} className="rounded-xl" /></Fld>
          <Fld id="n-res" label="Protocolo da reserva (opcional)"><Input id="n-res" value={res} onChange={(e) => setRes(e.target.value)} className="h-11 rounded-xl" placeholder="CAD-…" /></Fld>
          {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
          <Button type="submit" className="h-12" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar chamado"}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Fld({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
