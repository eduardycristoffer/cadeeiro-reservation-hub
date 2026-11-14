import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PRICE_SERVICES } from "@/lib/prices";
import { requireSupabase, friendlyError } from "@/lib/supabase";
import { toast } from "sonner";
import { WEEKDAYS, hhmm } from "@/lib/format";

export const Route = createFileRoute("/admin/unidades/$unitId")({
  head: () => ({ meta: [{ title: "Configurar unidade — Candeeiro Gestão" }, { name: "description", content: "Configurações de unidade, serviços e disponibilidade da Rede Candeeiro." }, { property: "og:title", content: "Configurar unidade — Candeeiro Gestão" }, { property: "og:description", content: "Configurações de unidade, serviços e disponibilidade da Rede Candeeiro." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: UnitDetail,
});

type Unit = {
  id: string; name: string; address: string | null; city: string | null; phone: string | null; description: string | null;
  photo_url: string | null; is_active: boolean; accepts_online_reservations: boolean; auto_confirm: boolean;
  min_advance_minutes: number; max_advance_days: number; large_group_threshold: number;
  services: string[]; has_delivery: boolean; agent_notes: string | null;
};
type Rule = { id: string; weekday: number; start_time: string; end_time: string; slot_interval_minutes: number; max_guests_per_slot: number; max_party_size: number; is_active: boolean };
type Block = { id: string; block_date: string; start_time: string | null; end_time: string | null; kind: string; reason: string | null };

function UnitDetail() {
  const { unitId } = Route.useParams();
  const [unit, setUnit] = useState<Unit | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    const sb = requireSupabase();
    const [u, r, b] = await Promise.all([
      sb.from("units").select("*").eq("id", unitId).single(),
      sb.from("reservation_capacity_rules").select("*").eq("unit_id", unitId).order("weekday").order("start_time"),
      sb.from("reservation_blocks").select("*").eq("unit_id", unitId).gte("block_date", new Date().toISOString().slice(0, 10)).order("block_date"),
    ]);
    if (u.error || r.error || b.error) { setLoadError(friendlyError(u.error || r.error || b.error)); return; }
    setLoadError(null);
    setUnit(u.data as Unit);
    setRules((r.data ?? []) as Rule[]);
    setBlocks((b.data ?? []) as Block[]);
  }
  useEffect(() => { load(); }, [unitId]);

  async function saveUnit() {
    if (!unit) return;
    const { id, ...rest } = unit;
    const { error } = await requireSupabase().from("units").update(rest).eq("id", id);
    setMsg(error ? "Sem permissão ou dados inválidos." : "Alterações salvas.");
    setTimeout(() => setMsg(null), 2500);
  }

  if (loadError) return <div role="alert" className="space-y-3 text-sm"><p>{loadError}</p><Button variant="outline" onClick={load}>Tentar novamente</Button></div>;
  if (!unit) return <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const set = <K extends keyof Unit>(k: K, v: Unit[K]) => setUnit({ ...unit, [k]: v });

  return (
    <div className="fade-up space-y-12">
      <div>
        <Link to="/admin/unidades" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Unidades</Link>
        <h1 className="mt-3 text-4xl font-semibold">{unit.name}</h1>
      </div>

      <Section title="Informações">
        <div className="grid gap-3 sm:grid-cols-2">
          <L label="Nome"><Input value={unit.name} onChange={(e) => set("name", e.target.value)} className="rounded-xl" /></L>
          <L label="Cidade"><Input value={unit.city ?? ""} onChange={(e) => set("city", e.target.value || null)} className="rounded-xl" /></L>
          <L label="Endereço"><Input value={unit.address ?? ""} onChange={(e) => set("address", e.target.value || null)} className="rounded-xl" /></L>
          <L label="Telefone"><Input type="tel" inputMode="tel" value={unit.phone ?? ""} onChange={(e) => set("phone", e.target.value || null)} className="rounded-xl" /></L>
          <L label="URL da foto"><Input value={unit.photo_url ?? ""} placeholder="https://…" onChange={(e) => set("photo_url", e.target.value || null)} className="rounded-xl" /></L>
          <L label="Antecedência mínima (min)"><Input type="number" inputMode="numeric" value={unit.min_advance_minutes} onChange={(e) => set("min_advance_minutes", Number(e.target.value))} className="rounded-xl" /></L>
          <L label="Reservas até quantos dias à frente"><Input type="number" inputMode="numeric" value={unit.max_advance_days} onChange={(e) => set("max_advance_days", Number(e.target.value))} className="rounded-xl" /></L>
          <L label="Grupo grande acima de (pessoas)"><Input type="number" inputMode="numeric" value={unit.large_group_threshold} onChange={(e) => set("large_group_threshold", Number(e.target.value))} className="rounded-xl" /><span className="mt-1 block text-xs text-muted-foreground">Grupo grande acima de {unit.large_group_threshold} pessoas precisa de aprovação.</span></L>
        </div>
        <div className="mt-5 space-y-3">
          <Toggle label="Unidade ativa" checked={unit.is_active} onChange={(v) => set("is_active", v)} />
          <Toggle label="Aceita reservas online" checked={unit.accepts_online_reservations} onChange={(v) => set("accepts_online_reservations", v)} />
          <Toggle label="Confirmar automaticamente quando houver vaga (grupos grandes sempre ficam pendentes)" checked={unit.auto_confirm} onChange={(v) => set("auto_confirm", v)} />
        </div>
        <div className="mt-6 flex items-center gap-4">
          <Button onClick={saveUnit}>Salvar</Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
      </Section>

      <Section title="Atendente de WhatsApp">
        <p className="mb-4 text-sm text-muted-foreground">O que esta unidade oferece e o que o atendente deve saber. Os valores ficam em <strong>Valores</strong>.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRICE_SERVICES.map((s) => {
            const on = unit.services.includes(s.id);
            return (
              <label key={s.id} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={on}
                  onChange={() => set("services", on ? unit.services.filter((x) => x !== s.id) : [...unit.services, s.id])} />
                {s.title}
              </label>
            );
          })}
        </div>
        <div className="mt-4"><Toggle label="Faz delivery (o atendente passa a registrar pedidos de delivery)" checked={unit.has_delivery} onChange={(v) => set("has_delivery", v)} /></div>
        <L label="Informações para o atendente (endereço, horários, brinquedoteca, regras da casa…)">
          <Textarea value={unit.agent_notes ?? ""} maxLength={4000} rows={6} onChange={(e) => set("agent_notes", e.target.value || null)} className="mt-1 rounded-xl" />
        </L>
        <p className="mt-1 text-xs text-muted-foreground">O atendente só afirma o que estiver aqui ou nos valores; o que faltar, ele encaminha para a equipe.</p>
        <div className="mt-5 flex items-center gap-4">
          <Button onClick={saveUnit}>Salvar</Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
      </Section>

      <Section title="Horários de funcionamento" hint="Cada faixa gera horários no intervalo definido. Não há limite de reservas por horário: a equipe aprova ou recusa cada uma.">
        <RuleList rules={rules} onChange={load} />
        <RuleForm unitId={unitId} onSaved={load} />
      </Section>

      <Section title="Bloqueios e feriados" hint="Dias ou faixas em que a unidade não aceita reservas.">
        <div className="overflow-hidden rounded-2xl border">
          {blocks.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhum bloqueio futuro.</p> : blocks.map((b) => (
            <div key={b.id} className="flex items-center justify-between border-b px-5 py-3 text-sm last:border-0">
              <span>
                <span className="font-medium">{new Date(b.block_date + "T12:00").toLocaleDateString("pt-BR")}</span>{" "}
                <span className="text-muted-foreground">{b.start_time ? `${hhmm(b.start_time)}–${hhmm(b.end_time!)}` : "Dia inteiro"} · {b.kind === "feriado" ? "Feriado" : b.kind === "data_especial" ? "Data especial" : "Manual"}{b.reason ? ` · ${b.reason}` : ""}</span>
              </span>
              <Button variant="ghost" size="icon" aria-label="Remover bloqueio" onClick={async () => { const { error } = await requireSupabase().from("reservation_blocks").delete().eq("id", b.id); if (error) toast.error(friendlyError(error)); else load(); }} className="shrink-0 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <BlockForm unitId={unitId} onSaved={load} />
      </Section>
    </div>
  );
}

function RuleList({ rules, onChange }: { rules: Rule[]; onChange: () => void }) {
  if (rules.length === 0) return <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">Nenhum horário configurado — a unidade ainda não aparece com datas disponíveis.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-muted-foreground">
          <tr><th className="px-4 py-3 font-medium">Dia</th><th className="px-4 py-3 font-medium">Faixa</th><th className="px-4 py-3 font-medium">Intervalo</th><th /></tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-4 py-3 font-medium">{WEEKDAYS[r.weekday]}</td>
              <td className="px-4 py-3">{hhmm(r.start_time)}–{hhmm(r.end_time)}</td>
              <td className="px-4 py-3">{r.slot_interval_minutes} min</td>
              <td className="px-4 py-3 text-right">
                <Button variant="ghost" size="icon" aria-label="Remover faixa" onClick={async () => { const { error } = await requireSupabase().from("reservation_capacity_rules").delete().eq("id", r.id); if (error) toast.error(friendlyError(error)); else onChange(); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RuleForm({ unitId, onSaved }: { unitId: string; onSaved: () => void }) {
  const [days, setDays] = useState<number[]>([2, 3, 4, 5, 6]);
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("23:00");
  const [interval, setIntervalMin] = useState(30);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (end <= start) return setErr("O fim precisa ser depois do início.");
    if (days.length === 0) return setErr("Selecione ao menos um dia.");
    const { error } = await requireSupabase().from("reservation_capacity_rules").insert(
      days.map((d) => ({ unit_id: unitId, weekday: d, start_time: start, end_time: end, slot_interval_minutes: interval, max_guests_per_slot: 9999, max_party_size: 200 })),
    );
    if (error) return setErr("Sem permissão ou dados inválidos.");
    onSaved();
  }

  return (
    <div className="mt-4 rounded-2xl bg-surface p-5">
      <p className="mb-3 text-sm font-medium">Adicionar faixa</p>
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((w, i) => (
          <button key={w} onClick={() => setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${days.includes(i) ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
            {w.slice(0, 3)}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <L label="Início"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-xl bg-background" /></L>
        <L label="Fim"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-xl bg-background" /></L>
        <L label="Intervalo (min)"><Input type="number" inputMode="numeric" min={5} value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))} className="rounded-xl bg-background" /></L>
      </div>
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      <Button className="mt-4" onClick={save}>Adicionar</Button>
    </div>
  );
}

function BlockForm({ unitId, onSaved }: { unitId: string; onSaved: () => void }) {
  const [date, setDate] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("20:00");
  const [kind, setKind] = useState("manual");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (!date) return setErr("Escolha a data.");
    const { error } = await requireSupabase().from("reservation_blocks").insert({
      unit_id: unitId, block_date: date, kind, reason: reason || null,
      start_time: allDay ? null : start, end_time: allDay ? null : end,
    });
    if (error) return setErr("Sem permissão ou dados inválidos.");
    setDate(""); setReason("");
    onSaved();
  }

  return (
    <div className="mt-4 rounded-2xl bg-surface p-5">
      <p className="mb-3 text-sm font-medium">Adicionar bloqueio</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <L label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl bg-background" /></L>
        <L label="Tipo">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-full rounded-xl border bg-background px-3 text-sm">
            <option value="manual">Manual</option><option value="feriado">Feriado</option><option value="data_especial">Data especial</option>
          </select>
        </L>
        <L label="Motivo"><Input value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-xl bg-background" /></L>
      </div>
      <div className="mt-4"><Toggle label="Dia inteiro" checked={allDay} onChange={setAllDay} /></div>
      {!allDay && (
        <div className="mt-3 grid max-w-sm grid-cols-2 gap-3">
          <L label="De"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-xl bg-background" /></L>
          <L label="Até"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-xl bg-background" /></L>
        </div>
      )}
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      <Button className="mt-4" onClick={save}>Bloquear</Button>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs text-muted-foreground">{label}</span>{children}</label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center gap-3 text-sm"><Switch checked={checked} onCheckedChange={onChange} /> {label}</label>;
}
