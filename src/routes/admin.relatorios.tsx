import { createFileRoute } from "@tanstack/react-router";
import { scopedUnits } from "@/lib/scope";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState, ListSkeleton, NativeSelect } from "@/components/admin/bits";
import { downloadCsv, pctChange, toCsvTable } from "@/lib/csv";
import { ROLE_LABEL } from "@/lib/audit";
import { ORIGIN as SAC_ORIGIN, sacStatusLabel, typeLabel } from "@/lib/sac";
import { useAuth } from "@/lib/auth";
import { friendlyError, requireSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Candeeiro Gestão" }, { name: "description", content: "Relatórios de reservas, SAC, WhatsApp, clientes e equipe da Rede Candeeiro." }, { property: "og:title", content: "Relatórios — Candeeiro Gestão" }, { property: "og:description", content: "Números consolidados da Rede Candeeiro." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Relatorios,
});

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type KN = { k: string | number; n: number; [x: string]: unknown };
const TABS = [
  { k: "consolidado", label: "Consolidado" }, { k: "reservas", label: "Reservas" }, { k: "funil", label: "Origem e funil" },
  { k: "sdr", label: "WhatsApp" }, { k: "sac", label: "SAC" }, { k: "clientes", label: "Clientes" }, { k: "equipe", label: "Equipe" },
] as const;
type Tab = (typeof TABS)[number]["k"];
const PERIODS = { hoje: "Hoje", "7d": "7 dias", "30d": "30 dias", mes: "Este mês", custom: "Personalizado" } as const;
type P = keyof typeof PERIODS;
const STATUS: Record<string, string> = { pendente: "Pendentes", confirmada: "Confirmadas", cancelada: "Canceladas/recusadas", concluida: "Concluídas", nao_compareceu: "Não compareceu" };
const ORIGINS: Record<string, string> = { landing_page: "Site", whatsapp_botao: "WhatsApp do site", sdr_whatsapp: "WhatsApp (SDR)", painel: "Painel", telefone: "Telefone", outro: "Outro" };
const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const OCC: Record<string, string> = { sem: "Sem ocasião", aniversario: "Aniversário", confraternizacao: "Confraternização", casal: "Casal", familia: "Família", negocios: "Negócios", outro: "Outro" };
const MSG: Record<string, string> = { reservation_confirmed: "Confirmação", reservation_cancelled: "Cancelamento" };
const CLS: Record<string, string> = { interesse_reserva: "Interesse em reserva", reserva_realizada: "Reserva feita", consulta_reserva: "Consulta de reserva", alteracao_reserva: "Alteração", cancelamento: "Cancelamento", sac_reclamacao: "Reclamação", elogio: "Elogio", sugestao: "Sugestão", duvida_geral: "Dúvida", outros: "Outros", atendimento_humano: "Atendimento humano", sem: "Sem classificação" };

const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
function range(p: P, de: string, ate: string): [string, string] {
  const today = iso(new Date());
  const back = (n: number) => iso(new Date(Date.now() - n * 86400000));
  if (p === "hoje") return [today, today];
  if (p === "7d") return [back(6), today];
  if (p === "30d") return [back(29), today];
  if (p === "mes") return [today.slice(0, 8) + "01", today];
  return [de || back(29), ate || today];
}
const br = (d: string) => d.split("-").reverse().join("/");
const n0 = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const fmt = (v: unknown, suf = "") => (v === null || v === undefined ? "—" : `${String(v).replace(".", ",")}${suf}`);

function Relatorios() {
  const { roles } = useAuth();
  const allowed = roles.includes("super_admin") || roles.includes("gestor");
  const [tab, setTab] = useState<Tab>("consolidado");
  const [p, setP] = useState<P>("30d");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [unit, setUnit] = useState("");
  const [service, setService] = useState("");
  const [origin, setOrigin] = useState("");
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<J | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [from, to] = range(p, de, ate);

  useEffect(() => { scopedUnits("id,name").order("sort_order").order("name").then(({ data }) => setUnits((data ?? []) as typeof units)); }, []);

  useEffect(() => {
    if (!allowed) return;
    let cancel = false;
    setData(null); setErr(null);
    const sb = requireSupabase();
    const base = { _from: from, _to: to, _unit: unit || null };
    const full = { ...base, _service: service || null, _origin: origin || null };
    const call = {
      consolidado: () => sb.rpc("report_summary", full),
      reservas: () => sb.rpc("report_reservations", full),
      funil: () => sb.rpc("report_funnel", full),
      sdr: () => sb.rpc("report_sdr", base),
      sac: () => sb.rpc("report_sac", base),
      clientes: () => sb.rpc("report_customers", full),
      equipe: () => sb.rpc("report_team", base),
    }[tab];
    call().then(({ data, error }) => {
      if (cancel) return;
      if (error) setErr(friendlyError(error)); else setData(data as J);
    });
    return () => { cancel = true; };
  }, [tab, from, to, unit, service, origin, allowed, tick]);

  const csv = useMemo(() => (data ? buildCsv(tab, data) : null), [tab, data]);
  if (!allowed) return <p className="text-muted-foreground">Somente gestores e super admin veem relatórios.</p>;

  function exportCsv() {
    if (!csv) return;
    downloadCsv(`relatorio-${tab}-${from}_${to}.csv`, toCsvTable(csv.h, csv.rows));
    requireSupabase().rpc("log_report_export", { _tab: tab, _from: from, _to: to, _unit: unit || null }).then(() => {});
  }

  const unitName = units.find((u) => u.id === unit)?.name ?? "Todas as unidades";

  return (
    <div className="fade-up report-root">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h1 className="truncate text-2xl font-semibold sm:text-4xl">Relatórios</h1>
        <div className="no-print flex gap-2">
          <Button variant="outline" className="h-11" onClick={exportCsv} disabled={!csv}><Download className="h-4 w-4" /><span className="max-sm:sr-only">CSV</span></Button>
          {tab === "consolidado" && <Button variant="outline" className="h-11" onClick={() => window.print()}><Printer className="h-4 w-4" /><span className="max-sm:sr-only">Imprimir / salvar PDF</span></Button>}
        </div>
      </div>
      <p className="print-only text-sm">{unitName} · {br(from)} a {br(to)}</p>

      <div className="no-print mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fld id="r-p" label="Período"><NativeSelect id="r-p" value={p} onChange={(e) => setP(e.target.value as P)}>{Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Fld>
        <Fld id="r-u" label="Unidade"><NativeSelect id="r-u" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">Todas</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></Fld>
        <Fld id="r-s" label="Serviço"><NativeSelect id="r-s" value={service} onChange={(e) => setService(e.target.value)}><option value="">Todos</option><option value="almoco_quilo">Almoço por quilo</option><option value="rodizio_carnes">Rodízio de carnes</option><option value="rodizio_pizza">Rodízio de pizza</option></NativeSelect></Fld>
        <Fld id="r-o" label="Origem"><NativeSelect id="r-o" value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="">Todas</option>{Object.entries(ORIGINS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Fld>
        {p === "custom" && <>
          <Fld id="r-de" label="De"><Input id="r-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-11 rounded-xl" /></Fld>
          <Fld id="r-ate" label="Até"><Input id="r-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-11 rounded-xl" /></Fld>
        </>}
      </div>
      {(tab === "sdr" || tab === "sac" || tab === "equipe") && (service || origin) && <p className="no-print mt-2 text-xs text-muted-foreground">Serviço e origem não se aplicam a esta aba.</p>}

      <div role="tablist" aria-label="Abas do relatório" className="seg-scroll no-print mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1 sm:grid-cols-7">
        {TABS.map((t) => (
          <button key={t.k} role="tab" type="button" aria-selected={tab === t.k} onClick={() => setTab(t.k)}
            className={`min-h-11 rounded-xl px-3 text-xs font-medium sm:px-2 sm:text-sm ${tab === t.k ? "bg-background shadow-soft" : "text-muted-foreground"}`}>{t.label}</button>
        ))}
      </div>

      <div className="mt-5">
        {err ? <ErrorState message={err} onRetry={() => setTick((n) => n + 1)} />
          : !data ? <ListSkeleton rows={3} />
          : tab === "consolidado" ? <Summary d={data} />
          : tab === "reservas" ? <Reservas d={data} />
          : tab === "funil" ? <Funil d={data} />
          : tab === "sdr" ? <Sdr d={data} />
          : tab === "sac" ? <SacTab d={data} />
          : tab === "clientes" ? <Clientes d={data} />
          : <Equipe d={data} />}
      </div>
    </div>
  );
}

/* ---------- blocos visuais ---------- */
function Kpi({ label, v, prev, suf = "", invert }: { label: string; v: unknown; prev?: unknown; suf?: string; invert?: boolean }) {
  const ch = prev === undefined ? null : pctChange(v == null ? null : n0(v), prev == null ? null : n0(prev));
  const good = ch == null ? null : invert ? ch < 0 : ch > 0;
  return (
    <div className="kpi min-w-0 rounded-2xl bg-card p-3 shadow-soft">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xl font-semibold">{fmt(v, suf)}</p>
      {prev !== undefined && <p className={`text-xs ${ch == null ? "text-muted-foreground" : good ? "text-status-confirmed" : "text-status-cancelled"}`}>{ch == null ? "sem comparação" : `${ch > 0 ? "+" : ""}${String(ch).replace(".", ",")}% vs. anterior`}</p>}
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) { return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{children}</div>; }
function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-4 break-inside-avoid rounded-2xl bg-card p-4 shadow-soft"><h2 className="text-sm font-semibold">{title}</h2><div className="mt-3">{children}</div></section>;
}
function Bars({ rows, label = (k) => String(k), empty = "Sem dados no período." }: { rows: KN[] | undefined; label?: (k: string | number) => string; empty?: string }) {
  const list = rows ?? [];
  if (!list.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...list.map((r) => n0(r.n)), 1);
  return (
    <ul className="space-y-2">
      {list.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2.5rem] items-center gap-2 text-xs">
          <span className="truncate">{label(r.k)}</span>
          <span className="h-3 rounded-full bg-surface"><span className="block h-3 rounded-full bg-primary" style={{ width: `${(n0(r.n) / max) * 100}%` }} /></span>
          <span className="text-right font-medium">{r.n}</span>
        </li>
      ))}
    </ul>
  );
}
function Line({ rows }: { rows: { k: string; n: number }[] | undefined }) {
  const list = rows ?? [];
  if (list.length < 2) return <Bars rows={list} label={(k) => br(String(k))} />;
  const max = Math.max(...list.map((r) => r.n), 1);
  const pts = list.map((r, i) => `${(i / (list.length - 1)) * 100},${40 - (r.n / max) * 36}`).join(" ");
  return (
    <div>
      <svg viewBox="0 0 100 42" className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label="Reservas por dia">
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" className="text-primary" />
      </svg>
      <div className="flex justify-between text-[11px] text-muted-foreground"><span>{br(list[0]!.k)}</span><span>máx. {max}/dia</span><span>{br(list[list.length - 1]!.k)}</span></div>
    </div>
  );
}
function Table({ head, rows, empty = "Sem dados no período." }: { head: string[]; rows: React.ReactNode[][]; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y text-sm">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-2">
          <span className="min-w-0 truncate">{r[0]}</span>
          <span className="flex shrink-0 gap-3 text-right text-xs text-muted-foreground">{r.slice(1).map((c, j) => <span key={j}><span className="sr-only">{head[j + 1]}: </span>{c}</span>)}</span>
        </li>
      ))}
    </ul>
  );
}
const entries = (o: J | undefined, labels: Record<string, string>) => Object.entries(o ?? {}).map(([k, n]) => ({ k: labels[k] ?? k, n: n0(n) }));
const isEmpty = (d: J, key = "total") => n0(d[key]) === 0;

/* ---------- abas ---------- */
function Reservas({ d }: { d: J }) {
  if (isEmpty(d)) return <EmptyState icon={BarChart3} title="Nenhuma reserva no período" text="Mude o período ou os filtros." />;
  const st = d["by_status"] ?? {};
  return (
    <>
      <Grid>
        <Kpi label="Reservas" v={d["total"]} /><Kpi label="Confirmadas" v={n0(st.confirmada) + n0(st.concluida)} />
        <Kpi label="Canceladas/recusadas" v={st.cancelada ?? 0} /><Kpi label="Pendentes" v={st.pendente ?? 0} />
        <Kpi label="Não compareceu" v={st.nao_compareceu ?? 0} /><Kpi label="Pessoas esperadas" v={d["guests_expected"]} />
        <Kpi label="Pessoas que vieram" v={d["guests_arrived"]} /><Kpi label="Grupos grandes" v={d["large_groups"]} />
        <Kpi label="Média por mesa" v={d["avg_party"]} suf=" pessoas" /><Kpi label="Taxa de aprovação" v={d["approval_rate"]} suf="%" />
        <Kpi label="Tempo até aprovar" v={d["avg_minutes_to_approve"]} suf=" min" /><Kpi label="Ocupação" v={d["occupancy_pct"]} suf="%" />
      </Grid>
      <Box title="Reservas por dia"><Line rows={d["by_day"]} /></Box>
      <div className="grid gap-x-4 lg:grid-cols-2">
        <Box title="Por dia da semana"><Bars rows={d["by_weekday"]} label={(k) => WEEK[Number(k)] ?? String(k)} /></Box>
        <Box title="Por horário"><Bars rows={d["by_hour"]} label={(k) => `${k}h`} /></Box>
        <Box title="Por ocasião"><Bars rows={d["by_occasion"]} label={(k) => OCC[String(k)] ?? String(k)} /></Box>
        <Box title="Por status"><Bars rows={entries(st, STATUS)} /></Box>
      </div>
      {d["capacity_seats"] === 0 && <p className="mt-3 text-xs text-muted-foreground">Ocupação sem cálculo: não há regras de capacidade cadastradas para o período.</p>}
    </>
  );
}
function Funil({ d }: { d: J }) {
  if (n0(d["created"]) === 0 && n0(d["leads"]) === 0 && n0(d["whatsapp_button"]?.total) === 0) return <EmptyState icon={BarChart3} title="Sem movimento no período" />;
  return (
    <>
      <Box title="Funil do site e de todas as origens">
        <Bars rows={[{ k: "Contatos no site", n: n0(d["leads"]) }, { k: "Reservas criadas", n: n0(d["created"]) }, { k: "Confirmadas", n: n0(d["confirmed"]) }]} />
        <p className="mt-2 text-xs text-muted-foreground">Visitas à página de reservas não são registradas; o funil começa no contato deixado no site.</p>
      </Box>
      <Box title="Reservas por origem"><Table head={["Origem", "Criadas", "Confirmadas", "Conversão"]} rows={(d["by_origin"] as KN[]).map((r) => [ORIGINS[String(r.k)] ?? r.k, r.n, n0(r["c"]), `${Math.round((n0(r["c"]) / Math.max(r.n, 1)) * 100)}%`])} /></Box>
      <Box title="Campanhas"><Bars rows={d["by_campaign"]} /></Box>
      <Box title="WhatsApp do site · whatsapp_botao"><Grid><Kpi label="Contatos" v={d["whatsapp_button"]?.total ?? 0} /><Kpi label="Convertidos" v={d["whatsapp_button"]?.converted ?? 0} /></Grid></Box>
    </>
  );
}
function Sdr({ d }: { d: J }) {
  const msgs = (d["messages"] ?? []) as { k: string; status: string; n: number }[];
  const sent = msgs.filter((m) => ["enviado", "entregue", "lido"].includes(m.status)).reduce((a, m) => a + m.n, 0);
  const failed = msgs.filter((m) => m.status === "falhou").reduce((a, m) => a + m.n, 0);
  if (n0(d["conversations"]) + n0(d["reservations"]) + n0(d["delivery_orders"]) + msgs.length === 0) return <EmptyState icon={BarChart3} title="Sem movimento do WhatsApp no período" />;
  return (
    <>
      <Grid>
        <Kpi label="Conversas" v={d["conversations"]} /><Kpi label="Atendidas só pelo bot" v={d["conversations_bot"]} />
        <Kpi label="Passadas para humano" v={d["handoffs"]} /><Kpi label="Reservas pelo bot" v={d["reservations"]} />
        <Kpi label="Confirmadas" v={d["reservations_confirmed"]} /><Kpi label="Conversão conversa→reserva" v={d["conversion_pct"]} suf="%" />
        <Kpi label="Pedidos de delivery" v={d["delivery_orders"]} /><Kpi label="SAC aberto pelo bot" v={d["sac_opened"]} />
        <Kpi label="Lembretes enviados" v={d["followups_sent"]} /><Kpi label="Lembretes com falha" v={d["followups_failed"]} />
        <Kpi label="Mensagens automáticas enviadas" v={sent} /><Kpi label="Mensagens com falha" v={failed} />
      </Grid>
      <div className="grid gap-x-4 lg:grid-cols-2">
        <Box title="Assuntos das conversas"><Bars rows={d["by_classification"]} label={(k) => CLS[String(k)] ?? String(k)} /></Box>
        <Box title="Motivos de passar para humano"><Bars rows={d["handoff_reasons"]} /></Box>
        <Box title="Mensagens automáticas"><Table head={["Tipo", "Status", "Qtd"]} rows={msgs.map((m) => [MSG[m.k] ?? m.k, m.status, m.n])} /></Box>
        <Box title="Delivery por status"><Bars rows={entries(d["delivery_by_status"], {})} /></Box>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">“Respondidos” dos lembretes e perguntas que o bot não soube responder ainda não são registrados pelo atendente.</p>
    </>
  );
}
function SacTab({ d }: { d: J }) {
  if (isEmpty(d)) return <EmptyState icon={BarChart3} title="Nenhum chamado no período" />;
  return (
    <>
      <Grid>
        <Kpi label="Chamados" v={d["total"]} /><Kpi label="SLA cumprido" v={d["sla_met_pct"]} suf="%" />
        <Kpi label="1ª resposta (média)" v={d["avg_first_response_h"]} suf=" h" /><Kpi label="Resolução (média)" v={d["avg_resolution_h"]} suf=" h" />
        <Kpi label="Clientes reincidentes" v={d["recurrent_customers"]} /><Kpi label="Reabertos" v={d["reopened"]} />
      </Grid>
      <div className="grid gap-x-4 lg:grid-cols-2">
        <Box title="Por tipo"><Bars rows={d["by_type"]} label={(k) => typeLabel(String(k))} /></Box>
        <Box title="Por status"><Bars rows={entries(d["by_status"], Object.fromEntries(["aberto", "em_andamento", "aguardando_cliente", "resolvido", "encerrado"].map((k) => [k, sacStatusLabel(k)])))} /></Box>
        <Box title="Por unidade"><Bars rows={d["by_unit"]} /></Box>
        <Box title="Por origem"><Bars rows={d["by_origin"]} label={(k) => SAC_ORIGIN[String(k)] ?? String(k)} /></Box>
      </div>
      <Box title="Responsáveis"><Table head={["Pessoa", "Chamados", "Resolvidos"]} rows={(d["by_assignee"] as KN[]).map((r) => [r.k, `${r.n} ch.`, `${n0(r["resolved"])} res.`])} /></Box>
    </>
  );
}
function Clientes({ d }: { d: J }) {
  if (n0(d["customers"]) === 0) return <EmptyState icon={BarChart3} title="Nenhum cliente com reserva no período" />;
  return (
    <>
      <Grid><Kpi label="Clientes" v={d["customers"]} /><Kpi label="Novos" v={d["new"]} /><Kpi label="Recorrentes" v={d["returning"]} /></Grid>
      <div className="grid gap-x-4 lg:grid-cols-2">
        <Box title="Mais reservas"><Table head={["Cliente", "Reservas", "Pessoas"]} rows={(d["top_customers"] as KN[]).map((r) => [r.k, `${r.n} res.`, `${n0(r["p"])} pes.`])} /></Box>
        <Box title="Maiores grupos"><Table head={["Cliente", "Pessoas", "Data"]} rows={(d["largest_groups"] as KN[]).map((r) => [r.k, `${r.n} pes.`, br(String(r["date"]))])} /></Box>
        <Box title="Cancelamentos recorrentes"><Table head={["Cliente", "Vezes"]} empty="Ninguém cancelou 2 vezes ou mais." rows={(d["recurrent_cancellations"] as KN[]).map((r) => [r.k, `${r.n}x`])} /></Box>
      </div>
    </>
  );
}
function Equipe({ d }: { d: J }) {
  const people = (d["people"] ?? []) as J[];
  if (!people.length) return <EmptyState icon={BarChart3} title="Nenhuma ação da equipe no período" text="As ações passam a contar a partir do novo histórico." />;
  return (
    <Box title="Ações por pessoa">
      <ul className="divide-y">
        {people.map((p, i) => (
          <li key={i} className="py-3 text-sm">
            <p className="font-medium">{p["k"]} <span className="text-xs font-normal text-muted-foreground">{p["role"] ? ROLE_LABEL[p["role"]] ?? p["role"] : ""}</span></p>
            <p className="mt-1 grid grid-cols-3 gap-1 text-xs text-muted-foreground sm:grid-cols-6">
              <span>{p["approved"]} aprovadas</span><span>{p["refused"]} recusadas</span><span>{p["cancelled"]} canceladas</span>
              <span>{p["created"]} criadas</span><span>{p["sac_resolved"]} SAC resolvidos</span><span>{p["total"]} ações</span>
            </p>
          </li>
        ))}
      </ul>
    </Box>
  );
}
function Summary({ d }: { d: J }) {
  const c = d["current"] ?? {}, pv = d["prev"] ?? {};
  const r = c.reservations ?? {}, rp = pv.reservations ?? {};
  const conf = (x: J) => n0(x["by_status"]?.confirmada) + n0(x["by_status"]?.concluida);
  return (
    <div className="summary">
      <p className="mb-3 text-xs text-muted-foreground">Comparado com {br(d["previous"]?.from ?? "")} a {br(d["previous"]?.to ?? "")} ({d["days"]} dias antes).</p>
      <h2 className="mb-2 text-sm font-semibold">Reservas</h2>
      <Grid>
        <Kpi label="Reservas" v={r.total} prev={rp.total} /><Kpi label="Confirmadas" v={conf(r)} prev={conf(rp)} />
        <Kpi label="Pessoas esperadas" v={r.guests_expected} prev={rp.guests_expected} /><Kpi label="Taxa de aprovação" v={r.approval_rate} prev={rp.approval_rate} suf="%" />
        <Kpi label="Ocupação" v={r.occupancy_pct} prev={rp.occupancy_pct} suf="%" /><Kpi label="Tempo até aprovar" v={r.avg_minutes_to_approve} prev={rp.avg_minutes_to_approve} suf=" min" invert />
      </Grid>
      <h2 className="mb-2 mt-4 text-sm font-semibold">WhatsApp e site</h2>
      <Grid>
        <Kpi label="Conversas no WhatsApp" v={c.sdr?.conversations} prev={pv.sdr?.conversations} /><Kpi label="Reservas pelo bot" v={c.sdr?.reservations} prev={pv.sdr?.reservations} />
        <Kpi label="Passadas para humano" v={c.sdr?.handoffs} prev={pv.sdr?.handoffs} invert /><Kpi label="Contatos no site" v={c.funnel?.leads} prev={pv.funnel?.leads} />
      </Grid>
      <h2 className="mb-2 mt-4 text-sm font-semibold">SAC e clientes</h2>
      <Grid>
        <Kpi label="Chamados de SAC" v={c.sac?.total} prev={pv.sac?.total} invert /><Kpi label="SLA cumprido" v={c.sac?.sla_met_pct} prev={pv.sac?.sla_met_pct} suf="%" />
        <Kpi label="Resolução (média)" v={c.sac?.avg_resolution_h} prev={pv.sac?.avg_resolution_h} suf=" h" invert /><Kpi label="Clientes novos" v={c.customers?.new} prev={pv.customers?.new} />
        <Kpi label="Clientes recorrentes" v={c.customers?.returning} prev={pv.customers?.returning} />
      </Grid>
    </div>
  );
}

function Fld({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-1.5 [&>*:last-child]:w-full"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

/* ---------- CSV por aba ---------- */
function buildCsv(tab: Tab, d: J): { h: string[]; rows: unknown[][] } {
  const kv = (o: J, prefix = "") => Object.entries(o).filter(([, v]) => typeof v !== "object" || v === null).map(([k, v]) => [prefix + k, v]);
  const list = (name: string, arr: KN[] | undefined, lab: (k: string | number) => string = String) => (arr ?? []).map((r) => [`${name}: ${lab(r.k)}`, r.n]);
  switch (tab) {
    case "consolidado": {
      const rows: unknown[][] = [];
      for (const sec of ["reservations", "funnel", "sdr", "sac", "customers"]) {
        const cur = d["current"]?.[sec] ?? {}, prev = d["prev"]?.[sec] ?? {};
        for (const [k, v] of kv(cur)) rows.push([`${sec}.${k}`, v, prev[k as string] ?? null, pctChange(v == null ? null : n0(v), prev[k as string] == null ? null : n0(prev[k as string]))]);
      }
      return { h: ["indicador", "periodo_atual", "periodo_anterior", "variacao_pct"], rows };
    }
    case "reservas": return { h: ["indicador", "valor"], rows: [...kv(d), ...entries(d["by_status"], STATUS).map((r) => [`status: ${r.k}`, r.n]), ...list("dia da semana", d["by_weekday"], (k) => WEEK[Number(k)] ?? String(k)), ...list("horário", d["by_hour"], (k) => `${k}h`), ...list("ocasião", d["by_occasion"], (k) => OCC[String(k)] ?? String(k)), ...((d["by_day"] ?? []) as KN[]).map((r) => [r.k, r.n])] };
    case "funil": return { h: ["indicador", "valor", "confirmadas"], rows: [...kv(d), ["whatsapp_botao: contatos", d["whatsapp_button"]?.total ?? 0], ["whatsapp_botao: convertidos", d["whatsapp_button"]?.converted ?? 0], ...((d["by_origin"] ?? []) as KN[]).map((r) => [`origem: ${ORIGINS[String(r.k)] ?? r.k}`, r.n, r["c"]]), ...list("campanha", d["by_campaign"])] };
    case "sdr": return { h: ["indicador", "valor", "status"], rows: [...kv(d), ...list("assunto", d["by_classification"], (k) => CLS[String(k)] ?? String(k)), ...list("motivo humano", d["handoff_reasons"]), ...((d["messages"] ?? []) as J[]).map((m) => [`mensagem: ${MSG[m["k"]] ?? m["k"]}`, m["n"], m["status"]])] };
    case "sac": return { h: ["indicador", "valor", "resolvidos"], rows: [...kv(d), ...list("tipo", d["by_type"], (k) => typeLabel(String(k))), ...list("unidade", d["by_unit"]), ...list("origem", d["by_origin"]), ...((d["by_assignee"] ?? []) as KN[]).map((r) => [`responsável: ${r.k}`, r.n, r["resolved"]])] };
    case "clientes": return { h: ["lista", "cliente", "telefone", "quantidade", "pessoas/data"], rows: [...kv(d).map(([k, v]) => [k, "", "", v, ""]), ...((d["top_customers"] ?? []) as KN[]).map((r) => ["mais reservas", r.k, r["phone"], r.n, r["p"]]), ...((d["largest_groups"] ?? []) as KN[]).map((r) => ["maiores grupos", r.k, "", r.n, r["date"]]), ...((d["recurrent_cancellations"] ?? []) as KN[]).map((r) => ["cancelamentos", r.k, r["phone"], r.n, ""])] };
    case "equipe": return { h: ["pessoa", "papel", "aprovadas", "recusadas", "canceladas", "criadas", "sac_resolvidos", "acoes_sac", "total"], rows: ((d["people"] ?? []) as J[]).map((p) => [p["k"], p["role"] ? ROLE_LABEL[p["role"]] ?? p["role"] : "", p["approved"], p["refused"], p["cancelled"], p["created"], p["sac_resolved"], p["sac_actions"], p["total"]]) };
  }
}
