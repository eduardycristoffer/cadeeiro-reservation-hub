import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, ListSkeleton, NativeSelect, StatCard } from "@/components/admin/bits";
import { useAuth } from "@/lib/auth";
import { brl, int, normalizeMoney, parseAdsReport, pct, splitMonthSpend, type AdsReport } from "@/lib/ads";
import { preferredUnitId } from "@/lib/scope";
import { useScope } from "@/lib/scope-context";
import { friendlyError, requireSupabase } from "@/lib/supabase";

const todayBr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const PLATFORMS = [["meta", "Meta (Instagram/Facebook)"], ["google", "Google"], ["tiktok", "TikTok"], ["outro", "Outro"]] as const;
const dm = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

/** Aba "Anúncios e CAC" dos Relatórios: quanto foi gasto, quantos clientes novos vieram, CAC e custo por reserva — e onde lançar o gasto do dia ou do mês. */
export function AdsTab({ from, to, unit }: { from: string; to: string; unit: string }) {
  const { roles } = useAuth();
  const { scope } = useScope();
  const isSuper = roles.includes("super_admin");
  const units = (scope?.units ?? []).filter((u) => u.is_active);
  const [rep, setRep] = useState<AdsReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setRep(null); setErr(null);
    void requireSupabase().rpc("report_ads", { _from: from, _to: to, _unit: unit || null, _campaign: null }).then(({ data, error }) => {
      if (!alive) return;
      if (error) setErr(friendlyError(error)); else setRep(parseAdsReport(data));
    });
    return () => { alive = false; };
  }, [from, to, unit, tick]);

  const t = rep?.totals;
  const m = rep?.metrics;
  const days = (rep?.by_day ?? []).filter((d) => d.spend > 0 || d.reservations > 0);
  return (
    <div className="space-y-6">
      {err ? <ErrorState message={err} onRetry={() => setTick((n) => n + 1)} /> : !rep || !t || !m ? <ListSkeleton rows={2} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Gasto em anúncios" value={brl(t.spend)} hint={t.spend > 0 ? undefined : "nada lançado no período"} />
            <StatCard label="Clientes novos" value={int(t.new_customers)} hint={`${int(t.reservations)} reservas de anúncio`} />
            <StatCard label="CAC (custo por cliente novo)" value={brl(m.cac)} hint={t.spend > 0 && !t.new_customers ? "sem cliente novo no período" : "gasto ÷ clientes novos"} />
            <StatCard label="Custo por reserva" value={brl(m.cost_per_reservation)} hint={m.roas_estimated !== null ? `retorno estimado ${pct(m.roas_estimated * 100)}` : undefined} />
          </div>
          {t.spend <= 0 && <p className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">Sem gasto lançado entre {dm(from)} e {dm(to)}. Lance abaixo o gasto do dia ou do mês para o CAC aparecer.</p>}
        </>
      )}

      <SpendForm units={units} defaultUnit={preferredUnitId(units, scope?.defaultUnitId ?? null)} allowNetwork={isSuper} selectedUnit={unit} onSaved={() => setTick((n) => n + 1)} />

      {rep && (days.length === 0 ? <EmptyState title="Nada por dia ainda" text="Quando houver gasto ou reservas no período, o detalhe diário aparece aqui." /> : (
        <section aria-label="Dia a dia">
          <h2 className="mb-2 text-sm font-semibold">Dia a dia</h2>
          <div className="overflow-x-auto rounded-2xl bg-card shadow-soft">
            <table className="w-full min-w-[320px] text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Dia</th><th className="px-4 py-2 text-right font-medium">Gasto</th><th className="px-4 py-2 text-right font-medium">Reservas</th></tr></thead>
              <tbody>{days.slice(-31).map((d) => <tr key={d.day} className="border-b last:border-0"><td className="px-4 py-2">{dm(d.day)}</td><td className="px-4 py-2 text-right tabular-nums">{brl(d.spend)}</td><td className="px-4 py-2 text-right tabular-nums">{int(d.reservations)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Para corrigir ou apagar um lançamento, use <Link to="/admin/anuncios" className="underline">Anúncios</Link>.</p>
        </section>
      ))}
    </div>
  );
}

function SpendForm({ units, defaultUnit, allowNetwork, selectedUnit, onSaved }: { units: { id: string; name: string; slug: string }[]; defaultUnit: string; allowNetwork: boolean; selectedUnit: string; onSaved: () => void }) {
  const [mode, setMode] = useState<"dia" | "mes">("dia");
  const [day, setDay] = useState(todayBr());
  const [month, setMonth] = useState(todayBr().slice(0, 7));
  const [amount, setAmount] = useState("");
  const [platform, setPlatform] = useState("meta");
  const [campaign, setCampaign] = useState("");
  const [unitId, setUnitId] = useState(selectedUnit || defaultUnit);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setUnitId(selectedUnit || defaultUnit); }, [selectedUnit, defaultUnit]);
  const money = normalizeMoney(amount);
  const camp = campaign.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").slice(0, 60);
  const ready = !!money && (mode === "dia" ? !!day : !!month) && (allowNetwork || !!unitId);
  const unit = units.find((u) => u.id === unitId);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !money) return;
    setBusy(true);
    try {
      if (mode === "dia") {
        const { error } = await requireSupabase().rpc("ad_spend_save", { _date: day, _platform: platform, _campaign: camp, _unit: unitId || null, _amount: Number(money), _impressions: null, _clicks: null, _leads: null, _notes: null });
        if (error) throw error;
      } else {
        const rows = splitMonthSpend(month, Number(money), todayBr());
        if (!rows.length) throw new Error("INVALID_DATE");
        const { data, error } = await requireSupabase().rpc("ad_spend_import", { _rows: rows.map((r) => ({ data: r.date, plataforma: platform, campanha: camp, unidade: unit?.slug ?? "", valor: String(r.amount) })) });
        if (error) throw error;
        const bad = (data as { com_erro?: number } | null)?.com_erro ?? 0;
        if (bad > 0) throw new Error("Alguns dias não foram salvos. Confira a unidade e tente de novo.");
      }
      toast.success(mode === "dia" ? "Gasto do dia salvo" : "Gasto do mês salvo");
      setAmount("");
      onSaved();
    } catch (e2) { toast.error(friendlyError(e2)); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-3xl bg-card p-5 shadow-soft no-print" aria-label="Lançar gasto em anúncios">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Lançar gasto</h2>
        <div role="tablist" aria-label="Período do gasto" className="inline-flex gap-1 rounded-xl bg-surface p-1">
          {([["dia", "Do dia"], ["mes", "Do mês"]] as const).map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={mode === k} onClick={() => setMode(k)} className={`min-h-9 rounded-lg px-3 text-sm font-medium ${mode === k ? "bg-card shadow-soft" : "text-muted-foreground"}`}>{l}</button>)}
        </div></div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-muted-foreground">{mode === "dia" ? "Dia" : "Mês"}
          {mode === "dia" ? <Input type="date" value={day} max={todayBr()} onChange={(e) => setDay(e.target.value)} className="mt-1 h-11 bg-background" /> : <Input type="month" value={month} max={todayBr().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className="mt-1 h-11 bg-background" />}</label>
        <label className="block text-xs font-medium text-muted-foreground">{mode === "dia" ? "Valor gasto (R$)" : "Total do mês (R$)"}
          <Input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-11 bg-background" aria-invalid={!!amount && !money} /></label>
        <label className="block text-xs font-medium text-muted-foreground">Onde anunciou
          <NativeSelect className="mt-1 block w-full" value={platform} onChange={(e) => setPlatform(e.target.value)}>{PLATFORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></label>
        {units.length > 1 || allowNetwork ? (
          <label className="block text-xs font-medium text-muted-foreground">Unidade
            <NativeSelect className="mt-1 block w-full" value={unitId} onChange={(e) => setUnitId(e.target.value)}>{allowNetwork && <option value="">Toda a rede</option>}{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></label>
        ) : <p className="self-end pb-3 text-sm"><span className="text-muted-foreground">Unidade: </span>{unit?.name}</p>}
      </div>
      <label className="block text-xs font-medium text-muted-foreground">Campanha <span className="font-normal">(opcional)</span>
        <Input value={campaign} maxLength={60} placeholder="ex.: black-friday" onChange={(e) => setCampaign(e.target.value)} className="mt-1 h-11 bg-background" /></label>
      {mode === "mes" && <p className="text-xs text-muted-foreground">O total é dividido igualmente pelos dias do mês (até hoje, se for o mês atual). Se já houver lançamento do mesmo local, campanha e unidade nesses dias, ele é substituído.</p>}
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={!ready || busy}>{busy && <Loader2 className="animate-spin" />}Salvar gasto</Button>
    </form>
  );
}
