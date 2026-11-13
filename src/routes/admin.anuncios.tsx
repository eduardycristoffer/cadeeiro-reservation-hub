import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Plus, Trash2, TrendingUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { EmptyState, ErrorState, ListSkeleton, NativeSelect, StatCard } from "@/components/admin/bits";
import { PERIODS, brl, budgetStatus, int, paceGap, parseAdsReport, parseSpendCsv, pct, periodRange, slugify, type AdsReport, type Period, type SpendRow } from "@/lib/ads";
import { downloadCsv, toCsvTable } from "@/lib/csv";
import { useAuth } from "@/lib/auth";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/anuncios")({
  head: () => ({ meta: [{ title: "Anúncios — Candeeiro Gestão" }, { name: "description", content: "Quanto foi gasto em anúncios, CAC, custo por reserva e projeção do mês." }, { property: "og:title", content: "Anúncios — Candeeiro Gestão" }, { property: "og:description", content: "Gasto, CAC e projeção dos anúncios." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Anuncios,
});

type Tab = "campanhas" | "cidades" | "dias" | "lancar" | "importar";
const TABS: { k: Tab; label: string }[] = [
  { k: "campanhas", label: "Campanhas" }, { k: "cidades", label: "Cidades" }, { k: "dias", label: "Dia a dia" },
  { k: "lancar", label: "Lançar gasto" }, { k: "importar", label: "Importar planilha" },
];
type Unit = { id: string; name: string; slug: string };
type SpendRecord = { id: string; spend_date: string; platform: string; campaign: string; unit_id: string | null; amount: number; impressions: number | null; clicks: number | null };

const br = (d: string) => d.split("-").reverse().join("/");

function Anuncios() {
  const { roles } = useAuth();
  const allowed = roles.includes("super_admin") || roles.includes("gestor");
  const [tab, setTab] = useState<Tab>("campanhas");
  const [p, setP] = useState<Period>("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [unit, setUnit] = useState("");
  const [campaign, setCampaign] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [report, setReport] = useState<AdsReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [from, to] = periodRange(p, de, ate);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!allowed) return;
    const sb = requireSupabase();
    void sb.from("units").select("id,name,slug").order("sort_order").order("name").then(({ data }) => setUnits((data ?? []) as Unit[]));
    void sb.from("campaign_pages").select("campaign").then(({ data }) => setKnown(Array.from(new Set((data ?? []).map((r: { campaign: string }) => r.campaign)))), () => undefined);
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    let off = false;
    setReport(null); setErr(null);
    void requireSupabase().rpc("report_ads", { _from: from, _to: to, _unit: unit || null, _campaign: campaign || null }).then(({ data, error }) => {
      if (off) return;
      if (error) { setErr(friendlyError(error)); return; }
      const r = parseAdsReport(data);
      if (!r) { setErr("Não foi possível ler o relatório."); return; }
      setReport(r);
    });
    return () => { off = true; };
  }, [allowed, from, to, unit, campaign, tick]);

  const campaignOptions = useMemo(() => Array.from(new Set([...known, ...(report?.by_campaign ?? []).map((c) => c.campaign).filter((c) => !c.startsWith("("))])).sort(), [known, report]);

  if (!allowed) return <ErrorState message="Só gestores acessam os anúncios." />;

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-semibold sm:text-4xl">Anúncios</h1>
      <p className="mt-1 text-sm text-muted-foreground">Quanto você gastou, o que voltou em reservas e quanto custa cada cliente novo.</p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="seg-scroll flex gap-1 overflow-x-auto rounded-full bg-surface p-1" role="tablist" aria-label="Período">
          {(Object.keys(PERIODS) as Period[]).map((k) => (
            <button key={k} role="tab" aria-selected={p === k} onClick={() => setP(k)}
              className={cn("min-h-10 shrink-0 rounded-full px-4 text-sm transition", p === k ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>{PERIODS[k]}</button>
          ))}
        </div>
        {p === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={de || from} onChange={(e) => setDe(e.target.value)} aria-label="De" className="h-11 w-40 rounded-xl" />
            <span className="text-muted-foreground">até</span>
            <Input type="date" value={ate || to} onChange={(e) => setAte(e.target.value)} aria-label="Até" className="h-11 w-40 rounded-xl" />
          </div>
        )}
        <NativeSelect aria-label="Cidade" value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">Todas as cidades</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Campanha" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="">Todas as campanhas</option>
          {campaignOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </NativeSelect>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{br(from)} a {br(to)}</p>

      {err ? <ErrorState message={err} onRetry={reload} /> : !report ? <ListSkeleton rows={3} /> : (
        <>
          <Kpis r={report} />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <BudgetCard r={report} unit={unit} campaign={campaign} month={to.slice(0, 7) + "-01"} onSaved={reload} />
            <ProjectionCard r={report} />
          </div>

          <div className="seg-scroll mt-6 flex gap-1 overflow-x-auto rounded-full bg-surface p-1" role="tablist" aria-label="Detalhes">
            {TABS.map((t) => (
              <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)}
                className={cn("min-h-10 shrink-0 rounded-full px-4 text-sm transition", tab === t.k ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>{t.label}</button>
            ))}
          </div>
          <div className="mt-4">
            {tab === "campanhas" && <Campanhas r={report} />}
            {tab === "cidades" && <Cidades r={report} />}
            {tab === "dias" && <Dias r={report} />}
            {tab === "lancar" && <Lancar units={units} known={campaignOptions} onChanged={reload} />}
            {tab === "importar" && <Importar onDone={reload} />}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ indicadores
function Kpis({ r }: { r: AdsReport }) {
  const t = r.totals, m = r.metrics;
  const leads = t.wa_leads + t.form_leads;
  return (
    <div className="mt-5 space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gasto" value={brl(t.spend)} hint={t.spend === 0 ? "Lance o gasto na aba “Lançar gasto”" : `${int(t.clicks)} cliques · ${int(t.impressions)} impressões`} />
        <StatCard label="Reservas dos anúncios" value={int(t.reservations)} hint={m.share_of_reservations != null ? `${pct(m.share_of_reservations)} de todas as reservas` : undefined} />
        <StatCard label="CAC (cliente novo)" value={brl(m.cac)} hint={`${int(t.new_customers)} clientes novos`} />
        <StatCard label="Custo por reserva" value={brl(m.cost_per_reservation)} hint="gasto ÷ reservas" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Custo por lead" value={brl(m.cost_per_lead)} hint={`${int(leads)} leads (${int(t.wa_leads)} WhatsApp · ${int(t.form_leads)} formulário)`} />
        <StatCard label="Custo por comparecimento" value={brl(m.cost_per_attended)} hint={m.attended_rate != null ? `${pct(m.attended_rate)} dos que reservaram vieram` : "ainda sem reservas concluídas"} />
        <StatCard label="Ticket médio por reserva" value={brl(m.avg_ticket_estimated)} hint={t.est_missing > 0 ? `estimado · ${int(t.est_missing)} reservas sem preço cadastrado` : "estimado pela tabela de Valores"} />
        <StatCard label="Retorno (ROAS)" value={m.roas_estimated != null ? `${m.roas_estimated.toLocaleString("pt-BR")}×` : "—"} hint="receita estimada ÷ gasto" />
      </div>
    </div>
  );
}

function BudgetCard({ r, unit, campaign, month, onSaved }: { r: AdsReport; unit: string; campaign: string; month: string; onSaved: () => void }) {
  const st = budgetStatus(r.budget);
  const pace = paceGap(r.projection);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const used = Math.min(100, r.budget?.used_pct ?? 0);

  async function save() {
    const n = Number(val.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) { toast.error("Informe um valor válido."); return; }
    setBusy(true);
    const { error } = await requireSupabase().rpc("ad_budget_set", { _month: month, _unit: unit || null, _campaign: campaign || "", _amount: n });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(n === 0 ? "Orçamento removido" : "Orçamento salvo");
    setVal(""); onSaved();
  }

  return (
    <section className="rounded-3xl bg-card p-5 shadow-soft">
      <h2 className="text-lg font-semibold">Orçamento do mês</h2>
      {r.budget && r.budget.planned > 0 ? (
        <>
          <p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">{brl(r.budget.spent)} <span className="text-sm font-normal text-muted-foreground sm:text-base">de {brl(r.budget.planned)}</span></p>
          <Progress value={used} className={cn("mt-3 h-2.5", st.tone === "bad" && "[&>div]:bg-destructive", st.tone === "warn" && "[&>div]:bg-status-pending")} aria-label="Orçamento usado" />
          <p className={cn("mt-2 text-sm", st.tone === "bad" ? "text-destructive" : "text-muted-foreground")}>{st.text}</p>
          {pace && (
            <p className="mt-1 text-sm text-muted-foreground">
              {pace.gap >= 0
                ? <>Pelo ritmo do plano você já deveria ter gasto {brl(pace.expected)}: <strong className="text-foreground">deixou de gastar {brl(pace.gap)}</strong>.</>
                : <>Pelo ritmo do plano o esperado era {brl(pace.expected)}: <strong className="text-destructive">gastou {brl(-pace.gap)} a mais</strong>.</>}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Defina quanto pretende investir neste mês para acompanhar o que falta gastar.</p>
      )}
      <div className="mt-4 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Label htmlFor="bud" className="text-xs text-muted-foreground">Orçamento de {br(month).slice(3)}{unit ? " (cidade escolhida)" : ""}{campaign ? ` · ${campaign}` : ""}</Label>
          <Input id="bud" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="R$ 0,00 (zero remove)" className="mt-1 h-11 rounded-xl tabular-nums" />
        </div>
        <Button onClick={() => void save()} disabled={busy || !val} className="h-11 rounded-xl">{busy ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}</Button>
      </div>
    </section>
  );
}

function ProjectionCard({ r }: { r: AdsReport }) {
  const pj = r.projection;
  return (
    <section className="rounded-3xl bg-card p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><TrendingUp className="size-5 text-muted-foreground" aria-hidden="true" /> Projeção do mês</h2>
      {!pj || pj.spend_to_date === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Quando houver gasto lançado no mês, mostramos aqui para onde o ritmo atual leva.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">Dia {pj.days_elapsed} de {pj.days_in_month}. Se o ritmo continuar igual:</p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div><dt className="text-xs text-muted-foreground">Gasto no fim do mês</dt><dd className="text-xl font-semibold tabular-nums">{brl(pj.spend_projected)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Reservas</dt><dd className="text-xl font-semibold tabular-nums">{int(pj.reservations_projected)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Clientes novos</dt><dd className="text-xl font-semibold tabular-nums">{int(pj.new_customers_projected)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">CAC projetado</dt><dd className="text-xl font-semibold tabular-nums">{brl(pj.cac_projected)}</dd></div>
          </dl>
          {pj.budget_month > 0 && pj.budget_left_projected != null && (
            <p className={cn("mt-3 text-sm", pj.budget_left_projected < 0 ? "text-destructive" : "text-muted-foreground")}>
              {pj.budget_left_projected < 0 ? `Nesse ritmo vai passar ${brl(-pj.budget_left_projected)} do orçamento.` : `Nesse ritmo sobram ${brl(pj.budget_left_projected)} do orçamento.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ tabelas
/** Tabela no computador; no celular cada linha vira um card (tabela larga com rolagem lateral é ruim de ler no dedo). */
function Scroll({ children, cards }: { children: React.ReactNode; cards?: React.ReactNode }) {
  return (
    <>
      {cards && <ul className="space-y-2.5 md:hidden">{cards}</ul>}
      <div className={cn("overflow-x-auto rounded-3xl bg-card shadow-soft", cards && "hidden md:block")}><table className="w-full min-w-[640px] text-sm">{children}</table></div>
    </>
  );
}
function CardMetric({ k, v, big }: { k: string; v: React.ReactNode; big?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{k}</dt>
      <dd className={cn("tabular-nums", big ? "mt-0.5 text-[15px] font-semibold" : "text-sm font-medium")}>{v}</dd>
    </div>
  );
}
const th = "px-4 py-3 text-left text-xs font-medium text-muted-foreground";
const td = "px-4 py-3 tabular-nums";

function Campanhas({ r }: { r: AdsReport }) {
  if (r.by_campaign.length === 0) return <EmptyState title="Nenhuma campanha no período" text="Lance o gasto e use links de campanha (aba Campanhas do menu) para ver o resultado de cada anúncio." />;
  function exportCsv() {
    downloadCsv(`anuncios-campanhas-${r.range.from}-${r.range.to}.csv`, toCsvTable(
      ["Campanha", "Gasto", "Leads", "Reservas", "Clientes novos", "CAC", "Custo por reserva", "Receita estimada"],
      r.by_campaign.map((c) => [c.campaign, c.spend, c.leads, c.reservations, c.new_customers, c.cac, c.cost_per_reservation, c.est_revenue])));
  }
  return (
    <div className="space-y-3">
      <Scroll cards={r.by_campaign.map((c) => (
        <li key={c.campaign} className="rounded-2xl bg-card p-4 shadow-soft">
          <p className="break-words font-semibold">{c.campaign}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2"><CardMetric big k="Gasto" v={brl(c.spend)} /><CardMetric big k="Reservas" v={int(c.reservations)} /><CardMetric big k="Custo/reserva" v={brl(c.cost_per_reservation)} /></dl>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3"><CardMetric k="Leads" v={int(c.leads)} /><CardMetric k="Clientes novos" v={int(c.new_customers)} /><CardMetric k="CAC" v={brl(c.cac)} /><CardMetric k="Receita estimada" v={brl(c.est_revenue)} /></dl>
        </li>
      ))}>
        <thead><tr><th className={th}>Campanha</th><th className={th}>Gasto</th><th className={th}>Leads</th><th className={th}>Reservas</th><th className={th}>Novos</th><th className={th}>CAC</th><th className={th}>Custo/reserva</th><th className={th}>Receita est.</th></tr></thead>
        <tbody className="divide-y divide-border">
          {r.by_campaign.map((c) => (
            <tr key={c.campaign}>
              <td className="px-4 py-3 font-medium">{c.campaign}</td><td className={td}>{brl(c.spend)}</td><td className={td}>{int(c.leads)}</td><td className={td}>{int(c.reservations)}</td>
              <td className={td}>{int(c.new_customers)}</td><td className={td}>{brl(c.cac)}</td><td className={td}>{brl(c.cost_per_reservation)}</td><td className={td}>{brl(c.est_revenue)}</td>
            </tr>
          ))}
        </tbody>
      </Scroll>
      <Button variant="outline" className="h-11 rounded-xl" onClick={exportCsv}><Download className="size-4" /> Baixar planilha</Button>
    </div>
  );
}

function Cidades({ r }: { r: AdsReport }) {
  if (r.by_unit.length === 0) return <EmptyState title="Sem dados por cidade" text="Lance o gasto escolhendo a cidade para comparar Goiânia e Anápolis." />;
  return (
    <Scroll cards={r.by_unit.map((u) => (
      <li key={u.unit} className="rounded-2xl bg-card p-4 shadow-soft">
        <p className="font-semibold">{u.unit}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2"><CardMetric big k="Gasto" v={brl(u.spend)} /><CardMetric big k="Custo/reserva" v={u.reservations > 0 ? brl(u.spend / u.reservations) : "—"} /><CardMetric k="Leads" v={int(u.leads)} /><CardMetric k="Reservas" v={int(u.reservations)} /></dl>
      </li>
    ))}>
      <thead><tr><th className={th}>Cidade</th><th className={th}>Gasto</th><th className={th}>Leads</th><th className={th}>Reservas</th><th className={th}>Custo/reserva</th></tr></thead>
      <tbody className="divide-y divide-border">
        {r.by_unit.map((u) => (
          <tr key={u.unit}><td className="px-4 py-3 font-medium">{u.unit}</td><td className={td}>{brl(u.spend)}</td><td className={td}>{int(u.leads)}</td><td className={td}>{int(u.reservations)}</td>
            <td className={td}>{u.reservations > 0 ? brl(u.spend / u.reservations) : "—"}</td></tr>
        ))}
      </tbody>
    </Scroll>
  );
}

function Dias({ r }: { r: AdsReport }) {
  const max = Math.max(1, ...r.by_day.map((d) => d.spend));
  if (r.by_day.length === 0) return <EmptyState title="Sem movimento no período" />;
  return (
    <ul className="space-y-2">
      {r.by_day.map((d) => (
        <li key={d.day} className="rounded-2xl bg-card p-3 shadow-soft">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium tabular-nums">{br(d.day).slice(0, 5)}</span>
            <span className="tabular-nums text-muted-foreground">{brl(d.spend)} · {int(d.reservations)} {d.reservations === 1 ? "reserva" : "reservas"}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true"><div className="h-full rounded-full bg-brand" style={{ width: `${(d.spend / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ lançar gasto
const PLATFORMS = [{ v: "meta", l: "Meta (Instagram/Facebook)" }, { v: "google", l: "Google" }, { v: "tiktok", l: "TikTok" }, { v: "outro", l: "Outro" }];

function Lancar({ units, known, onChanged }: { units: Unit[]; known: string[]; onChanged: () => void }) {
  const today = periodRange("hoje", "", "")[0];
  const [date, setDate] = useState(today);
  const [platform, setPlatform] = useState("meta");
  const [camp, setCamp] = useState("");
  const [unit, setUnit] = useState("");
  const [amount, setAmount] = useState("");
  const [impr, setImpr] = useState("");
  const [clicks, setClicks] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<SpendRecord[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await requireSupabase().from("ad_spend").select("id,spend_date,platform,campaign,unit_id,amount,impressions,clicks").order("spend_date", { ascending: false }).order("created_at", { ascending: false }).limit(25);
    setRows((data ?? []) as SpendRecord[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const value = Number(amount.replace(/\./g, "").replace(",", "."));
  const ok = Number.isFinite(value) && amount !== "" && value >= 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    const { error } = await requireSupabase().rpc("ad_spend_save", {
      _date: date, _platform: platform, _campaign: slugify(camp), _unit: unit || null, _amount: value,
      _impressions: impr ? Number(impr) : null, _clicks: clicks ? Number(clicks) : null, _leads: null, _notes: null,
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Gasto lançado");
    setAmount(""); setImpr(""); setClicks("");
    void load(); onChanged();
  }
  async function remove(id: string) {
    if (!window.confirm("Remover este lançamento?")) return;
    const { error } = await requireSupabase().rpc("ad_spend_delete", { _id: id });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Lançamento removido");
    void load(); onChanged();
  }

  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? "Todas";
  return (
    <div className="space-y-5">
      <form onSubmit={save} className="space-y-3 rounded-3xl bg-card p-5 shadow-soft">
        <h2 className="text-lg font-semibold">Quanto gastou no dia</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="sp-date">Dia</Label><Input id="sp-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="mt-1.5 h-12 rounded-xl" /></div>
          <div><Label htmlFor="sp-amount">Valor gasto (R$)</Label><Input id="sp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0,00" className="mt-1.5 h-12 rounded-xl tabular-nums" /></div>
          <div><Label htmlFor="sp-camp">Campanha</Label><Input id="sp-camp" list="sp-camps" value={camp} onChange={(e) => setCamp(e.target.value)} placeholder="ex.: black-friday (vazio = geral)" className="mt-1.5 h-12 rounded-xl" />
            <datalist id="sp-camps">{known.map((k) => <option key={k} value={k} />)}</datalist></div>
          <div><Label htmlFor="sp-unit">Cidade</Label>
            <NativeSelect id="sp-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1.5 h-12 w-full"><option value="">Todas</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></div>
          <div><Label htmlFor="sp-plat">Plataforma</Label>
            <NativeSelect id="sp-plat" value={platform} onChange={(e) => setPlatform(e.target.value)} className="mt-1.5 h-12 w-full">{PLATFORMS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}</NativeSelect></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="sp-imp">Impressões</Label><Input id="sp-imp" inputMode="numeric" value={impr} onChange={(e) => setImpr(e.target.value.replace(/\D/g, ""))} className="mt-1.5 h-12 rounded-xl tabular-nums" /></div>
            <div><Label htmlFor="sp-clk">Cliques</Label><Input id="sp-clk" inputMode="numeric" value={clicks} onChange={(e) => setClicks(e.target.value.replace(/\D/g, ""))} className="mt-1.5 h-12 rounded-xl tabular-nums" /></div>
          </div>
        </div>
        <Button type="submit" disabled={busy || !ok} className="h-11 rounded-xl">{busy ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4" /> Lançar gasto</>}</Button>
        <p className="text-xs text-muted-foreground">Lançar de novo o mesmo dia, campanha, plataforma e cidade atualiza o valor — não duplica.</p>
      </form>

      {!rows ? <ListSkeleton rows={2} /> : rows.length === 0 ? <EmptyState title="Nenhum gasto lançado ainda" /> : (
        <ul className="space-y-2">
          {rows.map((x) => (
            <li key={x.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium tabular-nums">{br(x.spend_date)} · {brl(Number(x.amount))}</p>
                <p className="truncate text-sm text-muted-foreground">{x.campaign || "geral"} · {unitName(x.unit_id)} · {x.platform}</p>
              </div>
              <Button variant="ghost" size="icon" className="size-11 text-muted-foreground" aria-label="Remover lançamento" onClick={() => void remove(x.id)}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ importar
const TEMPLATE = "data;plataforma;campanha;unidade;valor;impressoes;cliques\n05/11/2026;meta;black-friday;goiania;120,50;3400;85\n05/11/2026;meta;carnes-anapolis;anapolis;98,00;2800;61\n";

function Importar({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ importadas: number; com_erro: number; erros: { linha: number; erro: string }[] } | null>(null);
  const parsed = useMemo(() => (text.trim() ? parseSpendCsv(text) : null), [text]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 1_000_000) { toast.error("Arquivo grande demais (máx. 1 MB)."); return; }
    setText(await f.text()); setResult(null);
  }
  async function send(rows: SpendRow[]) {
    setBusy(true); setResult(null);
    const total = { importadas: 0, com_erro: 0, erros: [] as { linha: number; erro: string }[] };
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await requireSupabase().rpc("ad_spend_import", { _rows: rows.slice(i, i + 500) });
      if (error) { setBusy(false); toast.error(friendlyError(error)); return; }
      const d = data as typeof total;
      total.importadas += d.importadas; total.com_erro += d.com_erro;
      total.erros.push(...(d.erros ?? []).map((e) => ({ linha: e.linha + i, erro: e.erro })));
    }
    setBusy(false); setResult(total);
    if (total.importadas) { toast.success(`${total.importadas} linhas importadas`); onDone(); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-card p-5 shadow-soft">
        <h2 className="text-lg font-semibold">Importar gastos de uma planilha</h2>
        <p className="mt-1 text-sm text-muted-foreground">Serve a exportação do Gerenciador de Anúncios da Meta (CSV) ou a sua planilha. Colunas: data, valor e, se quiser, plataforma, campanha, unidade (goiania/anapolis), impressoes, cliques.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
            <Upload className="size-4" aria-hidden="true" /> Escolher arquivo
            <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => downloadCsv("modelo-gastos-anuncios.csv", "﻿" + TEMPLATE)}><Download className="size-4" /> Baixar modelo</Button>
        </div>
        <Label htmlFor="csv" className="mt-4 block text-xs text-muted-foreground">Ou cole o conteúdo aqui</Label>
        <textarea id="csv" value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} rows={5} spellCheck={false}
          className="mt-1 w-full rounded-xl border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>

      {parsed && (
        <div className="rounded-3xl bg-card p-5 shadow-soft">
          <p className="font-semibold">{parsed.rows.length} linhas prontas{parsed.problems.length ? ` · ${parsed.problems.length} com problema` : ""}</p>
          {parsed.problems.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-destructive">
              {parsed.problems.slice(0, 8).map((p) => <li key={p.linha}>Linha {p.linha}: {p.erro}</li>)}
              {parsed.problems.length > 8 && <li>…e mais {parsed.problems.length - 8}</li>}
            </ul>
          )}
          {parsed.rows.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">Total: <strong className="text-foreground">{brl(parsed.rows.reduce((s, x) => s + Number(x.valor), 0))}</strong> · {parsed.rows[0]!.data.split("-").reverse().join("/")} a {parsed.rows[parsed.rows.length - 1]!.data.split("-").reverse().join("/")}</p>
          )}
          <Button className="mt-4 h-11 rounded-xl" disabled={busy || parsed.rows.length === 0} onClick={() => void send(parsed.rows)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : `Importar ${parsed.rows.length} linhas`}
          </Button>
        </div>
      )}

      {result && (
        <div role="status" className="rounded-3xl bg-card p-5 shadow-soft">
          <p className="font-semibold">{result.importadas} importadas{result.com_erro ? ` · ${result.com_erro} recusadas pelo sistema` : ""}</p>
          {result.erros.slice(0, 8).map((e) => <p key={e.linha} className="mt-1 text-sm text-destructive">Linha {e.linha}: {e.erro}</p>)}
        </div>
      )}
    </div>
  );
}
