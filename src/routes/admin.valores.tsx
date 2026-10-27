import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/admin/bits";
import { ServicePrices } from "@/components/admin/PriceEditor";
import { useAuth } from "@/lib/auth";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { fromIsoDate, toIsoDate } from "@/lib/format";
import { PRICE_SERVICES, SERVICE_BY_ID, formatServices, priceText, type PriceService, type RawPrices } from "@/lib/prices";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/valores")({
  head: () => ({ meta: [{ title: "Valores — Candeeiro Gestão" }, { name: "robots", content: "noindex" }] }),
  component: Valores,
});

type Unit = { id: string; name: string; services: PriceService[] };
type PTable = { id: string; unit_id: string; name: string; valid_from: string | null; valid_until: string | null; priority: number; is_active: boolean; notes: string | null };
type Holiday = { id: string; holiday_date: string; name: string };

const br = (iso: string) => iso.split("-").reverse().join("/");
const windowText = (t: PTable) =>
  t.valid_from && t.valid_until ? `de ${br(t.valid_from)} a ${br(t.valid_until)}`
  : t.valid_from ? `a partir de ${br(t.valid_from)}`
  : t.valid_until ? `até ${br(t.valid_until)}`
  : "sempre (tabela padrão)";

function Valores() {
  const { roles } = useAuth();
  const canEdit = roles.includes("super_admin") || roles.includes("gestor");
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [unitId, setUnitId] = useState<string>("");
  const [tab, setTab] = useState<"tabelas" | "previa" | "feriados">("tabelas");

  useEffect(() => {
    requireSupabase().from("units").select("id,name,services").order("sort_order").order("name").then(({ data }) => {
      const list = (data ?? []) as Unit[];
      setUnits(list);
      if (list[0]) setUnitId((cur) => cur || list[0]!.id);
    });
  }, []);

  const unit = units?.find((u) => u.id === unitId) ?? null;

  return (
    <div className="fade-up">
      <h1 className="text-4xl font-semibold">Valores</h1>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <NativeSelect aria-label="Unidade" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          {units?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </NativeSelect>
        <div className="grid w-full grid-cols-3 rounded-2xl bg-surface p-1 text-sm sm:flex sm:w-auto">
          {([["tabelas", "Tabelas"], ["previa", "Prévia por data"], ["feriados", "Feriados"]] as const).map(([k, label]) => (
            <Button variant="ghost" key={k} onClick={() => setTab(k)} className={cn("h-11 min-w-0 rounded-xl px-2 text-xs transition sm:text-sm", tab === k ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>{label}</Button>
          ))}
        </div>
      </div>

      {!units && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {unit && unit.services.length === 0 && (
        <p className="mt-6 rounded-2xl bg-surface p-4 text-sm">
          Esta unidade ainda não tem serviços marcados. Abra a unidade em <strong>Unidades</strong> e marque o que ela oferece
          (rodízio de carnes, rodízio de pizza, almoço no quilo, almoço executivo).
        </p>
      )}
      {unit && tab === "tabelas" && <Tables unit={unit} canEdit={canEdit} />}
      {unit && tab === "previa" && <Preview unit={unit} />}
      {tab === "feriados" && <Holidays canEdit={canEdit} />}
    </div>
  );
}

function Tables({ unit, canEdit }: { unit: Unit; canEdit: boolean }) {
  const [tables, setTables] = useState<PTable[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const today = toIsoDate(new Date());

  const load = useCallback(async () => {
    const { data } = await requireSupabase().from("price_tables").select("*").eq("unit_id", unit.id).order("priority", { ascending: false }).order("valid_from", { ascending: false, nullsFirst: false });
    setTables((data ?? []) as PTable[]);
  }, [unit.id]);
  useEffect(() => { setTables(null); setOpenId(null); void load(); }, [load]);

  async function patch(id: string, p: Partial<PTable>) {
    const { error } = await requireSupabase().from("price_tables").update(p).eq("id", id);
    if (error) toast.error(friendlyError(error)); else { toast.success("Salvo"); await load(); }
  }

  async function duplicate(src: PTable) {
    const sb = requireSupabase();
    const { data: created, error } = await sb.from("price_tables")
      .insert({ unit_id: src.unit_id, name: `Cópia de ${src.name}`.slice(0, 80), valid_from: null, valid_until: null, priority: src.priority, is_active: false, notes: src.notes })
      .select("id").single();
    if (error || !created) { toast.error(friendlyError(error)); return; }
    const newId = (created as { id: string }).id;
    const [r, c] = await Promise.all([
      sb.from("price_rules").select("service,weekdays,on_holidays,amount,sort_order").eq("table_id", src.id),
      sb.from("price_child_policies").select("service,free_until_age,child_from_age,child_to_age,child_amount,full_from_age").eq("table_id", src.id),
    ]);
    const rules = ((r.data ?? []) as object[]).map((x) => ({ ...x, table_id: newId }));
    const kids = ((c.data ?? []) as object[]).map((x) => ({ ...x, table_id: newId }));
    if (rules.length) await sb.from("price_rules").insert(rules);
    if (kids.length) await sb.from("price_child_policies").insert(kids);
    toast.success("Tabela copiada (inativa). Ajuste o período e ative.");
    await load();
    setOpenId(newId);
  }

  async function remove(t: PTable) {
    if (!window.confirm(`Excluir a tabela "${t.name}" e todos os valores dela?`)) return;
    const { error } = await requireSupabase().from("price_tables").delete().eq("id", t.id);
    if (error) toast.error(friendlyError(error)); else { toast.success("Tabela excluída"); await load(); }
  }

  return (
    <div className="mt-6 space-y-4">
      {canEdit && (
        <div>
          {creating ? <NewTable unitId={unit.id} onDone={async (id) => { setCreating(false); await load(); if (id) setOpenId(id); }} /> : (
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nova tabela</Button>
          )}
        </div>
      )}
      {!tables ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : tables.length === 0 && (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">Nenhuma tabela. Crie uma tabela padrão (sem datas) para começar.</p>
      )}
      {tables?.map((t) => {
        const inWindow = (!t.valid_from || t.valid_from <= today) && (!t.valid_until || t.valid_until >= today);
        const open = openId === t.id;
        return (
          <section key={t.id} className="rounded-3xl bg-card p-5 shadow-soft">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{t.name}</h2>
                  {t.is_active && inWindow && <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-brand-foreground">Vigente hoje</span>}
                  {!t.is_active && <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs">Inativa</span>}
                  {t.is_active && !inWindow && <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs">Fora do período</span>}
                </div>
                <p className="text-sm text-muted-foreground">{windowText(t)} · prioridade {t.priority}</p>
              </div>
              {canEdit && (
                <label className="flex items-center gap-2 text-sm">
                  Ativa <Switch checked={t.is_active} onCheckedChange={(v) => patch(t.id, { is_active: v })} />
                </label>
              )}
              <Button variant="outline" size="sm" onClick={() => setOpenId(open ? null : t.id)}>
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {open ? "Fechar" : canEdit ? "Editar" : "Ver"}
              </Button>
              {canEdit && <Button variant="ghost" size="icon" aria-label="Duplicar tabela" onClick={() => duplicate(t)}><Copy className="h-4 w-4" /></Button>}
              {canEdit && <Button variant="ghost" size="icon" aria-label="Excluir tabela" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>}
            </div>

            {open && (
              <div className="mt-5 space-y-5">
                {canEdit && <TableMeta key={`${t.id}-${t.name}-${t.valid_from}-${t.valid_until}-${t.priority}`} t={t} onSave={(p) => patch(t.id, p)} />}
                {unit.services.length === 0 && <p className="text-sm text-muted-foreground">Marque os serviços da unidade para cadastrar valores.</p>}
                <div className="grid gap-4 lg:grid-cols-2">
                  {PRICE_SERVICES.filter((s) => unit.services.includes(s.id)).map((s) => (
                    <ServicePrices key={`${t.id}-${s.id}`} tableId={t.id} service={s.id} canEdit={canEdit} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Regra de escolha: para cada serviço vale a tabela ativa cujo período cobre a data, de maior prioridade. Uma tabela só com um serviço
                  (ex.: promoção de pizza) vale apenas para ele; os demais seguem a tabela de baixo.
                </p>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function TableMeta({ t, onSave }: { t: PTable; onSave: (p: Partial<PTable>) => void }) {
  const [f, setF] = useState({ name: t.name, valid_from: t.valid_from ?? "", valid_until: t.valid_until ?? "", priority: String(t.priority), notes: t.notes ?? "" });
  return (
    <div className="grid gap-3 rounded-2xl bg-surface p-4 sm:grid-cols-5">
      <label className="text-xs text-muted-foreground sm:col-span-2">Nome<Input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1 h-9 rounded-xl text-foreground" /></label>
      <label className="text-xs text-muted-foreground">Vale de<Input type="date" value={f.valid_from} onChange={(e) => setF({ ...f, valid_from: e.target.value })} className="mt-1 h-9 rounded-xl text-foreground" /></label>
      <label className="text-xs text-muted-foreground">até<Input type="date" value={f.valid_until} onChange={(e) => setF({ ...f, valid_until: e.target.value })} className="mt-1 h-9 rounded-xl text-foreground" /></label>
      <label className="text-xs text-muted-foreground">Prioridade<Input type="number" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className="mt-1 h-9 rounded-xl text-foreground" /></label>
      <div className="sm:col-span-5">
        <Button size="sm" onClick={() => {
          if (f.valid_from && f.valid_until && f.valid_until < f.valid_from) { toast.error("A data final precisa ser igual ou depois da inicial."); return; }
          onSave({ name: f.name.trim(), valid_from: f.valid_from || null, valid_until: f.valid_until || null, priority: Number(f.priority) || 0, notes: f.notes || null });
        }}>Salvar período</Button>
        <span className="ml-3 text-xs text-muted-foreground">Deixe as datas em branco para a tabela padrão.</span>
      </div>
    </div>
  );
}

function NewTable({ unitId, onDone }: { unitId: string; onDone: (id?: string) => void }) {
  const [f, setF] = useState({ name: "", valid_from: "", valid_until: "", priority: "10" });
  const [busy, setBusy] = useState(false);
  async function create() {
    if (f.name.trim().length < 2) { toast.error("Dê um nome à tabela."); return; }
    if (f.valid_from && f.valid_until && f.valid_until < f.valid_from) { toast.error("A data final precisa ser igual ou depois da inicial."); return; }
    setBusy(true);
    const { data, error } = await requireSupabase().from("price_tables")
      .insert({ unit_id: unitId, name: f.name.trim(), valid_from: f.valid_from || null, valid_until: f.valid_until || null, priority: Number(f.priority) || 0 })
      .select("id").single();
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Tabela criada. Cadastre os valores.");
    onDone((data as { id: string }).id);
  }
  return (
    <div className="grid gap-3 rounded-3xl bg-card p-5 shadow-soft sm:grid-cols-5">
      <label className="text-xs text-muted-foreground sm:col-span-2">Nome<Input value={f.name} placeholder="Tabela de novembro" onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1 h-9 rounded-xl text-foreground" /></label>
      <label className="text-xs text-muted-foreground">Vale de<Input type="date" value={f.valid_from} onChange={(e) => setF({ ...f, valid_from: e.target.value })} className="mt-1 h-9 rounded-xl text-foreground" /></label>
      <label className="text-xs text-muted-foreground">até<Input type="date" value={f.valid_until} onChange={(e) => setF({ ...f, valid_until: e.target.value })} className="mt-1 h-9 rounded-xl text-foreground" /></label>
      <label className="text-xs text-muted-foreground">Prioridade<Input type="number" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className="mt-1 h-9 rounded-xl text-foreground" /></label>
      <div className="flex gap-2 sm:col-span-5">
        <Button onClick={create} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar tabela"}</Button>
        <Button variant="ghost" onClick={() => onDone()}>Cancelar</Button>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-5">Maior prioridade vence quando duas tabelas cobrem a mesma data. A tabela padrão (sem datas) deve ter prioridade 0.</p>
    </div>
  );
}

function Preview({ unit }: { unit: Unit }) {
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [raw, setRaw] = useState<RawPrices | null | undefined>(undefined);
  useEffect(() => {
    setRaw(undefined);
    requireSupabase().rpc("get_unit_prices", { _unit_id: unit.id, _date: date }).then(({ data, error }) => {
      if (error) { toast.error(friendlyError(error)); setRaw(null); } else setRaw(data as RawPrices | null);
    });
  }, [unit.id, date]);
  const services = useMemo(() => (raw ? formatServices(raw) : []), [raw]);
  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted-foreground">Valores em <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="ml-2 inline-block h-9 w-auto rounded-xl text-foreground" /></label>
        {raw && <span className="text-sm capitalize text-muted-foreground">{raw.is_holiday ? `feriado (${raw.holiday_name})` : fromIsoDate(date).toLocaleDateString("pt-BR", { weekday: "long" })}</span>}
      </div>
      {raw === undefined && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      {raw && services.length === 0 && <p className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">Nenhuma tabela vale para esta data.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {services.map((s) => (
          <div key={s.codigo} className="rounded-3xl bg-card p-5 shadow-soft">
            <h3 className="font-semibold">{SERVICE_BY_ID[s.codigo].title}</h3>
            <p className="text-xs text-muted-foreground">Tabela: {s.tabela}{s.vigencia ? ` (${s.vigencia})` : ""}</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{s.hoje ? s.hoje.valor_texto : "—"}</p>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {s.linhas.map((l, i) => <li key={i}>{l.dias}: {l.valor_texto}</li>)}
              {s.infantil && <li>Infantil: {s.infantil}</li>}
            </ul>
          </div>
        ))}
      </div>
      {raw && services.length > 0 && (
        <details className="rounded-2xl bg-surface p-4 text-sm">
          <summary className="cursor-pointer font-medium">Texto completo que o atendente enxerga</summary>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-muted-foreground">{priceText(raw)}</pre>
        </details>
      )}
    </div>
  );
}

function Holidays({ canEdit }: { canEdit: boolean }) {
  const [list, setList] = useState<Holiday[] | null>(null);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const load = useCallback(async () => {
    const from = toIsoDate(new Date(Date.now() - 30 * 86400000));
    const { data } = await requireSupabase().from("holidays").select("id,holiday_date,name").gte("holiday_date", from).order("holiday_date");
    setList((data ?? []) as Holiday[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!date || name.trim().length < 2) { toast.error("Informe a data e o nome do feriado."); return; }
    const sb = requireSupabase();
    const { data: org } = await sb.from("organizations").select("id").limit(1).maybeSingle();
    const { error } = await sb.from("holidays").insert({ organization_id: (org as { id: string } | null)?.id, holiday_date: date, name: name.trim() });
    if (error) toast.error(error.code === "23505" ? "Já existe um feriado nessa data." : friendlyError(error));
    else { setDate(""); setName(""); toast.success("Feriado adicionado"); await load(); }
  }
  async function remove(id: string) {
    const { error } = await requireSupabase().from("holidays").delete().eq("id", id);
    if (error) toast.error(friendlyError(error)); else await load();
  }
  return (
    <div className="mt-6 max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">Nos feriados vale a linha "Feriados" da tabela (ex.: sábados, domingos e feriados). Sem essa linha, vale o dia da semana.</p>
      {canEdit && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">Data<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-9 rounded-xl text-foreground" /></label>
          <label className="min-w-48 flex-1 text-xs text-muted-foreground">Nome<Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 rounded-xl text-foreground" placeholder="Aniversário da cidade" /></label>
          <Button onClick={add}><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
      )}
      {!list ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <ul className="divide-y rounded-3xl bg-card shadow-soft">
          {list.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nenhum feriado cadastrado.</li>}
          {list.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span><span className="tabular-nums">{br(h.holiday_date)}</span> <span className="ml-2 text-muted-foreground">{fromIsoDate(h.holiday_date).toLocaleDateString("pt-BR", { weekday: "long" })}</span> · {h.name}</span>
              {canEdit && <Button variant="ghost" size="icon" aria-label="Remover feriado" onClick={() => remove(h.id)}><Trash2 className="h-4 w-4" /></Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
