import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { SERVICE_BY_ID, brl, weekdaysLabel, type PriceService } from "@/lib/prices";
import { cn } from "@/lib/utils";

type RuleDraft = { id?: string; weekdays: number[]; on_holidays: boolean; amount: string };
type ChildDraft = { free_until_age: string; child_from_age: string; child_to_age: string; child_amount: string; full_from_age: string };

const DAY_BUTTONS: { d: number; letter: string; name: string }[] = [
  { d: 1, letter: "S", name: "Segunda" }, { d: 2, letter: "T", name: "Terça" }, { d: 3, letter: "Q", name: "Quarta" },
  { d: 4, letter: "Q", name: "Quinta" }, { d: 5, letter: "S", name: "Sexta" }, { d: 6, letter: "S", name: "Sábado" },
  { d: 0, letter: "D", name: "Domingo" },
];
const EMPTY_CHILD: ChildDraft = { free_until_age: "", child_from_age: "", child_to_age: "", child_amount: "", full_from_age: "" };

const toNum = (s: string): number | null => {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};
const toInt = (s: string): number | null => {
  const n = toNum(s);
  return n !== null && Number.isInteger(n) ? n : null;
};
const fmt = (n: number | string | null) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

/** Valores de um serviço dentro de uma tabela: linhas (dias -> valor) e política infantil. */
export function ServicePrices({ tableId, service, canEdit }: { tableId: string; service: PriceService; canEdit: boolean }) {
  const meta = SERVICE_BY_ID[service];
  const [rules, setRules] = useState<RuleDraft[] | null>(null);
  const [child, setChild] = useState<ChildDraft | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [hasChild, setHasChild] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    const sb = requireSupabase();
    const [r, c] = await Promise.all([
      sb.from("price_rules").select("id,weekdays,on_holidays,amount").eq("table_id", tableId).eq("service", service).order("sort_order").order("created_at"),
      sb.from("price_child_policies").select("*").eq("table_id", tableId).eq("service", service).maybeSingle(),
    ]);
    if (r.error || c.error) { setLoadError(friendlyError(r.error || c.error)); return; }
    setRules(((r.data ?? []) as { id: string; weekdays: number[]; on_holidays: boolean; amount: number }[])
      .map((x) => ({ id: x.id, weekdays: x.weekdays, on_holidays: x.on_holidays, amount: fmt(Number(x.amount).toFixed(2)) })));
    const cp = c.data as { id: string; free_until_age: number | null; child_from_age: number | null; child_to_age: number | null; child_amount: number | null; full_from_age: number | null } | null;
    setChildId(cp?.id ?? null);
    setHasChild(Boolean(cp));
    setChild(cp ? {
      free_until_age: fmt(cp.free_until_age), child_from_age: fmt(cp.child_from_age), child_to_age: fmt(cp.child_to_age),
      child_amount: cp.child_amount === null ? "" : fmt(Number(cp.child_amount).toFixed(2)), full_from_age: fmt(cp.full_from_age),
    } : EMPTY_CHILD);
    setDirty(false);
  }
  useEffect(() => { void load(); }, [tableId, service]);

  const edit = (fn: () => void) => { fn(); setDirty(true); };

  async function save() {
    if (!rules || !child) return;
    for (const r of rules) {
      if (toNum(r.amount) === null || (toNum(r.amount) as number) < 0) { toast.error("Informe o valor de cada linha (ex.: 79,90)."); return; }
      if (r.weekdays.length === 0 && !r.on_holidays) { toast.error("Cada linha precisa de pelo menos um dia ou feriados."); return; }
    }
    const ca = { free: toInt(child.free_until_age), from: toInt(child.child_from_age), to: toInt(child.child_to_age), amount: toNum(child.child_amount), full: toInt(child.full_from_age) };
    const anyRange = child.child_from_age.trim() || child.child_to_age.trim() || child.child_amount.trim();
    if (hasChild && anyRange && (ca.from === null || ca.to === null || ca.amount === null || ca.to < ca.from)) {
      toast.error("Faixa infantil: informe idade inicial, idade final (maior ou igual) e o valor."); return;
    }
    setSaving(true);
    const sb = requireSupabase();
    try {
      const { data: current } = await sb.from("price_rules").select("id").eq("table_id", tableId).eq("service", service);
      const keep = new Set(rules.map((r) => r.id).filter(Boolean) as string[]);
      const toDelete = ((current ?? []) as { id: string }[]).map((x) => x.id).filter((id) => !keep.has(id));
      if (toDelete.length) {
        const { error } = await sb.from("price_rules").delete().in("id", toDelete);
        if (error) throw error;
      }
      for (const [i, r] of rules.entries()) {
        const row = { weekdays: r.weekdays, on_holidays: r.on_holidays, amount: toNum(r.amount) as number, sort_order: i + 1 };
        const { error } = r.id
          ? await sb.from("price_rules").update(row).eq("id", r.id)
          : await sb.from("price_rules").insert({ ...row, table_id: tableId, service });
        if (error) throw error;
      }
      if (hasChild) {
        const row = {
          free_until_age: ca.free, child_from_age: anyRange ? ca.from : null, child_to_age: anyRange ? ca.to : null,
          child_amount: anyRange ? ca.amount : null, full_from_age: ca.full,
        };
        const { error } = childId
          ? await sb.from("price_child_policies").update(row).eq("id", childId)
          : await sb.from("price_child_policies").insert({ ...row, table_id: tableId, service });
        if (error) throw error;
      } else if (childId) {
        const { error } = await sb.from("price_child_policies").delete().eq("id", childId);
        if (error) throw error;
      }
      toast.success(`${meta.short}: valores salvos`);
      await load();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <div role="alert" className="space-y-3 py-6 text-sm"><p>{loadError}</p><Button variant="outline" onClick={load}>Tentar novamente</Button></div>;
  if (!rules || !child) return <div className="py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold">{meta.title}</h4>
        <span className="text-xs text-muted-foreground">cobrado {meta.per === "kg" ? "por kg" : "por pessoa"}</span>
      </div>

      <div className="mt-3 space-y-2">
        {rules.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma linha. Adicione os valores por dia da semana.</p>}
        {rules.map((r, i) => (
          <div key={r.id ?? `n${i}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-2">
            <div className="flex min-w-0 flex-wrap gap-1" role="group" aria-label="Dias da semana">
              {DAY_BUTTONS.map((b) => {
                const on = r.weekdays.includes(b.d);
                return (
                  <button
                    key={b.d} type="button" disabled={!canEdit} aria-pressed={on} aria-label={b.name} title={b.name}
                    onClick={() => edit(() => setRules(rules.map((x, j) => j === i ? { ...x, weekdays: on ? x.weekdays.filter((d) => d !== b.d) : [...x.weekdays, b.d] } : x)))}
                    className={cn("h-8 w-8 rounded-full text-xs font-semibold transition-colors", on ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}
                  >{b.letter}</button>
                );
              })}
              <button
                type="button" disabled={!canEdit} aria-pressed={r.on_holidays}
                onClick={() => edit(() => setRules(rules.map((x, j) => j === i ? { ...x, on_holidays: !x.on_holidays } : x)))}
                className={cn("h-8 rounded-full px-3 text-xs font-semibold transition-colors", r.on_holidays ? "bg-brand text-brand-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
              >Feriados</button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">R$</span>
              <Input
                value={r.amount} inputMode="decimal" disabled={!canEdit} aria-label="Valor" placeholder="0,00"
                onChange={(e) => edit(() => setRules(rules.map((x, j) => j === i ? { ...x, amount: e.target.value } : x)))}
                className="h-9 w-24 rounded-xl text-right tabular-nums"
              />
            </div>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{weekdaysLabel(r.weekdays, r.on_holidays)}</span>
            {canEdit && (
              <Button variant="ghost" size="icon" aria-label="Remover linha" onClick={() => edit(() => setRules(rules.filter((_, j) => j !== i)))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => edit(() => setRules([...rules, { weekdays: [], on_holidays: false, amount: "" }]))}>
            <Plus className="h-4 w-4" /> Adicionar linha
          </Button>
        )}
      </div>

      <div className="mt-4 border-t pt-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={hasChild} disabled={!canEdit} onChange={(e) => edit(() => setHasChild(e.target.checked))} className="h-4 w-4" />
          Política infantil
        </label>
        {hasChild && (
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            <Field label="Não paga até (anos)" value={child.free_until_age} disabled={!canEdit} onChange={(v) => edit(() => setChild({ ...child, free_until_age: v }))} />
            <Field label="Infantil de (anos)" value={child.child_from_age} disabled={!canEdit} onChange={(v) => edit(() => setChild({ ...child, child_from_age: v }))} />
            <Field label="até (anos)" value={child.child_to_age} disabled={!canEdit} onChange={(v) => edit(() => setChild({ ...child, child_to_age: v }))} />
            <Field label="Valor infantil (R$)" value={child.child_amount} disabled={!canEdit} onChange={(v) => edit(() => setChild({ ...child, child_amount: v }))} />
            <Field label="Integral a partir de (anos)" value={child.full_from_age} disabled={!canEdit} onChange={(v) => edit(() => setChild({ ...child, full_from_age: v }))} />
          </div>
        )}
      </div>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={saving || !dirty}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar valores"}</Button>
          {dirty && <span className="text-xs text-muted-foreground">Alterações não salvas</span>}
          {!dirty && rules.length > 0 && <span className="text-xs text-muted-foreground">{rules.map((r) => brl(Number(toNum(r.amount) ?? 0))).join(" · ")}</span>}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <Input value={value} inputMode="decimal" disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1 h-9 rounded-xl text-foreground" />
    </label>
  );
}
