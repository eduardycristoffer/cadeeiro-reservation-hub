import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileUp, Loader2, MessageCircle, Phone, Plus, Search, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, ErrorState, ListSkeleton, NativeSelect, StatusBadge } from "@/components/admin/bits";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/lib/scope-context";
import { preferredUnitId } from "@/lib/scope";
import { actionLabel } from "@/lib/audit";
import { downloadCsv, fmtCsvDate, toCsvTable } from "@/lib/csv";
import { EXPORT_HEADERS, IMPORT_TEMPLATE, parseContactsCsv, sourceLabel, type ContactParse } from "@/lib/contacts";
import { maskBrPhone } from "@/lib/format";
import { formatPhoneE164, waLink } from "@/lib/reservations";
import { friendlyError, requireSupabase } from "@/lib/supabase";

type Row = {
  id: string; full_name: string; phone_e164: string; email: string | null; notes: string | null; whatsapp_opt_in: boolean; source: string;
  unit_id: string | null; unit_name: string | null; reservations_count: number; last_reservation: string | null; created_at: string; total_count: number;
};
const PAGE = 25;
const rpc = <T,>(name: string, args: Record<string, unknown>) => requireSupabase().rpc(name as never, args as never) as unknown as Promise<{ data: T; error: { message: string } | null }>;
const dt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const day = (iso: string | null) => (iso ? fmtCsvDate(iso).slice(0, 10) : "—");

/** Base de clientes da loja: busca, filtro por unidade, cadastro, importação e exportação (CSV) e a ficha completa de cada pessoa. */
export function CustomersBase({ openId, onOpen }: { openId?: string | undefined; onOpen: (id: string | undefined) => void }) {
  const { roles } = useAuth();
  const { scope } = useScope();
  const isManager = roles.includes("super_admin") || roles.includes("gestor");
  const units = scope?.units ?? [];
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [unit, setUnit] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const total = rows?.[0]?.total_count ?? 0;

  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(0); }, [unit]);
  useEffect(() => {
    let alive = true;
    setError(null);
    void rpc<Row[]>("customers_directory", { _q: term || null, _unit: unit || null, _limit: PAGE, _offset: page * PAGE }).then(({ data, error: e }) => {
      if (!alive) return;
      if (e) setError(friendlyError(e)); else setRows(Array.isArray(data) ? data : []);
    });
    return () => { alive = false; };
  }, [term, unit, page, tick]);

  async function exportCsv() {
    setExporting(true);
    try {
      const all: Row[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error: e } = await rpc<Row[]>("customers_directory", { _q: term || null, _unit: unit || null, _limit: 1000, _offset: offset });
        if (e) throw e;
        all.push(...data);
        if (data.length < 1000) break;
      }
      const { error: le } = await rpc("customers_export_log", { _count: all.length, _unit: unit || null });
      if (le) throw le;
      downloadCsv("contatos.csv", toCsvTable(EXPORT_HEADERS, all.map((r) => [r.full_name, formatPhoneE164(r.phone_e164), r.email, r.notes, r.whatsapp_opt_in ? "sim" : "não", r.unit_name, sourceLabel(r.source), r.reservations_count, r.last_reservation, r.created_at])));
      toast.success(`${all.length} contatos exportados`);
    } catch (e) { toast.error(friendlyError(e)); } finally { setExporting(false); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Buscar cliente por nome, telefone ou e-mail" placeholder="Nome, telefone ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} className="h-12 bg-card pl-10" />
        </div>
        {units.length > 1 && (
          <NativeSelect aria-label="Unidade" className="h-12 bg-card" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">Todas as unidades</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </NativeSelect>
        )}
        <Button className="h-12" onClick={() => setCreating(true)}><Plus />Novo contato</Button>
        {isManager && <Button variant="outline" className="h-12" onClick={() => setImporting(true)}><Upload />Importar</Button>}
        {isManager && <Button variant="outline" className="h-12" disabled={exporting || !total} onClick={exportCsv}>{exporting ? <Loader2 className="animate-spin" /> : <Download />}Exportar</Button>}
      </div>
      <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">{rows ? `${total.toLocaleString("pt-BR")} ${total === 1 ? "contato" : "contatos"}${term ? ` para “${term}”` : ""}` : "Carregando…"}</p>

      <div className="mt-3">
        {error ? <ErrorState message={error} onRetry={() => setTick((n) => n + 1)} /> : !rows ? <ListSkeleton /> : rows.length === 0 ? (
          <EmptyState icon={Users} title={term ? "Ninguém encontrado" : "Nenhum contato ainda"}
            text={term ? "Confira o nome ou o telefone, ou limpe a busca." : "Os clientes aparecem aqui quando fazem reserva. Você também pode cadastrar um contato ou importar uma planilha."}
            action={!term ? <><Button className="h-11" onClick={() => setCreating(true)}><Plus />Novo contato</Button>{isManager && <Button variant="outline" className="h-11" onClick={() => setImporting(true)}><Upload />Importar planilha</Button>}</> : undefined} />
        ) : (
          <ul className="grid gap-2">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-soft transition hover:ring-2 hover:ring-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{r.full_name}</span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">{formatPhoneE164(r.phone_e164)}{r.email ? ` · ${r.email}` : ""}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{[r.unit_name, sourceLabel(r.source)].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="text-right text-xs text-muted-foreground">
                    <span className="block text-base font-semibold text-foreground tabular-nums">{r.reservations_count}</span>
                    {r.reservations_count === 1 ? "reserva" : "reservas"}
                    {r.last_reservation && <span className="block">última {day(r.last_reservation)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {total > PAGE && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" className="h-11" disabled={!page} onClick={() => setPage((p) => p - 1)}><ChevronLeft />Anterior</Button>
          <span className="text-xs text-muted-foreground">{page + 1} / {Math.ceil(total / PAGE)}</span>
          <Button variant="outline" className="h-11" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Próxima<ChevronRight /></Button>
        </div>
      )}

      <ContactForm open={creating} onOpenChange={setCreating} contactId={null} onSaved={(id) => { setCreating(false); setTick((n) => n + 1); onOpen(id); }} />
      <ImportDialog open={importing} onOpenChange={setImporting} onDone={() => setTick((n) => n + 1)} />
      <Ficha id={openId} onClose={() => onOpen(undefined)} onChanged={() => setTick((n) => n + 1)} />
    </div>
  );
}

// ------------------------------------------------------------------ cadastro / edição

type Customer = { id: string; full_name: string; phone_e164: string; email: string | null; notes: string | null; whatsapp_opt_in: boolean; origin_unit_id: string | null };

function ContactForm({ open, onOpenChange, contactId, initial, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; contactId: string | null; initial?: Customer; onSaved: (id: string) => void }) {
  const { scope } = useScope();
  const units = (scope?.units ?? []).filter((u) => u.is_active);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(initial?.full_name ?? ""); setPhone(initial ? maskBrPhone(initial.phone_e164.replace(/^55/, "")) : ""); setEmail(initial?.email ?? "");
    setNotes(initial?.notes ?? ""); setOptIn(initial?.whatsapp_opt_in ?? false);
    setUnit(initial?.origin_unit_id ?? preferredUnitId(units, scope?.defaultUnitId ?? null));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setBusy(true);
    const { data, error } = await rpc<string>("customer_save", { _id: contactId, _full_name: name, _phone: phone, _email: email || null, _notes: notes || null, _unit: unit || null, _opt_in: optIn });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(contactId ? "Contato atualizado" : "Contato cadastrado");
    onSaved(contactId ?? data);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{contactId ? "Editar contato" : "Novo contato"}</DialogTitle><DialogDescription>{contactId ? "As mudanças ficam registradas no histórico, com o seu nome." : "Cadastre quem ainda não fez reserva. O telefone não pode se repetir."}</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label className="block text-sm font-medium">Nome completo<Input className="mt-1 h-12" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" required /></label>
          <label className="block text-sm font-medium">WhatsApp<Input className="mt-1 h-12" inputMode="tel" placeholder="(62) 99999-0000" value={phone} onChange={(e) => setPhone(maskBrPhone(e.target.value))} required /></label>
          <label className="block text-sm font-medium">E-mail <span className="font-normal text-muted-foreground">(opcional)</span><Input className="mt-1 h-12" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} /></label>
          {!contactId && units.length > 1 && (
            <label className="block text-sm font-medium">Unidade<NativeSelect className="mt-1 block h-12 w-full" value={unit} onChange={(e) => setUnit(e.target.value)} required><option value="">Escolha a unidade</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></label>
          )}
          <label className="block text-sm font-medium">Observações <span className="font-normal text-muted-foreground">(opcional)</span><Textarea className="mt-1" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <label className="flex items-start gap-3 rounded-xl bg-surface p-3 text-sm"><Checkbox checked={optIn} onCheckedChange={(v) => setOptIn(v === true)} className="mt-0.5" /><span>Autorizou receber mensagens por WhatsApp<span className="block text-xs text-muted-foreground">Só marque se a pessoa concordou. Fica registrado.</span></span></label>
          <DialogFooter><Button type="submit" className="h-12 w-full sm:w-auto" disabled={busy || name.trim().length < 2 || phone.replace(/\D/g, "").length < 10 || !(contactId || unit)}>{busy && <Loader2 className="animate-spin" />}Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ importação em passos

function ImportDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const { scope } = useScope();
  const units = (scope?.units ?? []).filter((u) => u.is_active);
  const [unit, setUnit] = useState("");
  const [parsed, setParsed] = useState<ContactParse | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ criados: number; atualizados: number; ja_existiam: number; total_erros: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setParsed(null); setResult(null); setFileName(""); setUnit(preferredUnitId(units, scope?.defaultUnitId ?? null)); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = result ? 3 : parsed ? 2 : 1;

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 5_000_000) { toast.error("Arquivo muito grande (máximo 5 MB)."); return; }
    setFileName(f.name);
    setParsed(parseContactsCsv(await f.text()));
  }
  async function run() {
    if (!parsed || !unit) return;
    setBusy(true);
    const sum = { criados: 0, atualizados: 0, ja_existiam: 0, total_erros: 0 };
    try {
      for (let i = 0; i < parsed.rows.length; i += 1000) {
        const { data, error } = await rpc<typeof sum>("customers_import", { _rows: parsed.rows.slice(i, i + 1000), _unit: unit });
        if (error) throw error;
        sum.criados += data.criados; sum.atualizados += data.atualizados; sum.ja_existiam += data.ja_existiam; sum.total_erros += data.total_erros;
      }
      setResult(sum);
      onDone();
    } catch (e) { toast.error(friendlyError(e)); if (sum.criados || sum.atualizados) { setResult(sum); onDone(); } } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Importar contatos</DialogTitle><DialogDescription>Passo {step} de 3 · {step === 1 ? "Escolha a unidade e o arquivo" : step === 2 ? "Confira antes de importar" : "Pronto"}</DialogDescription></DialogHeader>
        {step === 1 && (
          <div className="space-y-4">
            {units.length > 1 && <label className="block text-sm font-medium">Unidade dos contatos<NativeSelect className="mt-1 block h-12 w-full" value={unit} onChange={(e) => setUnit(e.target.value)}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></label>}
            <div className="rounded-2xl border border-dashed p-5 text-center">
              <FileUp className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">Arquivo CSV (planilha salva como CSV)</p>
              <p className="mt-1 text-xs text-muted-foreground">Colunas: Nome e Telefone (obrigatórias), E-mail, Observações e Aceita WhatsApp (sim/não). Até 5.000 contatos.</p>
              <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="sr-only" aria-label="Arquivo CSV" onChange={(e) => void onFile(e.target.files?.[0])} />
              <Button className="mt-3 h-11" onClick={() => input.current?.click()}>Escolher arquivo</Button>
            </div>
            <Button variant="link" className="h-auto p-0 text-sm" onClick={() => downloadCsv("modelo-contatos.csv", IMPORT_TEMPLATE)}><Download />Baixar planilha modelo</Button>
          </div>
        )}
        {step === 2 && parsed && (
          <div className="space-y-4">
            <p className="text-sm"><span className="font-medium">{fileName}</span> · <span className="text-status-confirmed">{parsed.rows.length} contatos prontos</span>{parsed.problems.length > 0 && <> · <span className="text-status-cancelled">{parsed.problems.length} com problema (serão ignorados)</span></>}</p>
            {parsed.rows.length > 0 && <ul className="divide-y rounded-xl bg-surface text-sm">{parsed.rows.slice(0, 4).map((r, i) => <li key={i} className="flex justify-between gap-3 px-3 py-2"><span className="min-w-0 truncate">{r.nome}</span><span className="shrink-0 text-muted-foreground">{r.telefone}</span></li>)}{parsed.rows.length > 4 && <li className="px-3 py-2 text-xs text-muted-foreground">e mais {parsed.rows.length - 4}…</li>}</ul>}
            {parsed.problems.length > 0 && <details className="text-sm"><summary className="cursor-pointer py-1 font-medium">Ver problemas</summary><ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">{parsed.problems.slice(0, 50).map((p) => <li key={p.linha}>Linha {p.linha}: {p.erro}</li>)}</ul></details>}
            <p className="text-xs text-muted-foreground">Quem já existe (mesmo telefone) não é duplicado: só completam e-mail e observação que estavam vazios. Contatos importados só recebem WhatsApp se a coluna “Aceita WhatsApp” for “sim”.</p>
            <DialogFooter className="gap-2"><Button variant="outline" className="h-11" onClick={() => { setParsed(null); setFileName(""); }}>Trocar arquivo</Button><Button className="h-11" disabled={busy || !parsed.rows.length || !unit} onClick={() => void run()}>{busy && <Loader2 className="animate-spin" />}Importar {parsed.rows.length}</Button></DialogFooter>
          </div>
        )}
        {step === 3 && result && (
          <div className="space-y-4">
            <ul className="grid grid-cols-3 gap-2 text-center">{[["Novos", result.criados], ["Completados", result.atualizados], ["Já existiam", result.ja_existiam]].map(([k, v]) => <li key={k} className="rounded-xl bg-surface p-3"><p className="text-2xl font-semibold tabular-nums">{v}</p><p className="text-xs text-muted-foreground">{k}</p></li>)}</ul>
            {result.total_erros > 0 && <p className="text-xs text-muted-foreground">{result.total_erros} linhas foram recusadas pelo servidor.</p>}
            <p className="text-xs text-muted-foreground">A importação ficou registrada no histórico, com o seu nome.</p>
            <DialogFooter><Button className="h-11" onClick={() => onOpenChange(false)}>Concluir</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ ficha

type Profile = {
  customer: Customer & { whatsapp_opt_out_at: string | null; source: string; created_at: string };
  stats: { reservas: number; concluidas: number; canceladas: number; nao_compareceu: number; pessoas: number; primeira: string | null; ultima: string | null };
  reservations: { id: string; protocol: string; date: string; time: string; party_size: number; status: string; origin: string; unit: string; notes: string | null; created_at: string }[];
  status_history: { protocol: string; from: string | null; to: string; by: string; note: string | null; at: string }[];
  sac: { protocol: string; category: string; subject: string; status: string; created_at: string }[];
  leads: { created_at: string; city: string; status: string; campaign: string | null; origin: string }[];
  wifi: { first_seen_at: string; last_seen_at: string; visits: number }[];
  crm: { kind: string; status: string; text: string; sent_at: string | null; created_at: string }[];
  consents: { type: string; granted: boolean; source: string; at: string }[];
  log: { at: string; who: string; role: string | null; source: string; action: string; note: string | null }[];
};
const TABS = [["resumo", "Resumo"], ["reservas", "Reservas"], ["historico", "Histórico"], ["relacionamento", "Relacionamento"]] as const;

function Ficha({ id, onClose, onChanged }: { id: string | undefined; onClose: () => void; onChanged: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("resumo");
  const [editing, setEditing] = useState(false);
  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    if (!id) { setP(null); setError(null); return; }
    let alive = true;
    setError(null);
    void rpc<Profile>("customer_profile", { _id: id }).then(({ data, error: e }) => { if (!alive) return; if (e) setError(friendlyError(e)); else setP(data); });
    return () => { alive = false; };
  }, [id, tick]);
  useEffect(() => { if (id) setTab("resumo"); }, [id]);

  const timeline = useMemo(() => {
    if (!p) return [];
    const items = [
      ...p.log.map((l) => ({ at: l.at, who: l.who, text: `${actionLabel(l.action)}${l.note ? ` · ${l.note}` : ""}` })),
      ...p.status_history.map((h) => ({ at: h.at, who: h.by, text: `${h.protocol}: ${h.from ? `${h.from} → ` : ""}${h.to}${h.note ? ` — ${h.note}` : ""}` })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }, [p]);

  return (
    <Sheet open={!!id} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="text-left"><SheetTitle>{p?.customer.full_name ?? "Ficha do cliente"}</SheetTitle><SheetDescription>{p ? `${formatPhoneE164(p.customer.phone_e164)} · cliente desde ${day(p.customer.created_at)}` : "Tudo o que já aconteceu com esta pessoa"}</SheetDescription></SheetHeader>
        {error ? <div className="mt-6"><ErrorState message={error} onRetry={load} /></div> : !p ? <div className="mt-6"><ListSkeleton /></div> : (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="h-11"><a href={`tel:+${p.customer.phone_e164}`}><Phone />Ligar</a></Button>
              <Button asChild variant="outline" className="h-11"><a href={waLink(p.customer.phone_e164)} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a></Button>
              <Button variant="outline" className="h-11" onClick={() => setEditing(true)}>Editar dados</Button>
            </div>
            <div role="tablist" aria-label="Seções da ficha" className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-surface p-1">
              {TABS.map(([k, label]) => <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-10 shrink-0 flex-1 rounded-lg px-3 text-sm font-medium transition ${tab === k ? "bg-card shadow-soft" : "text-muted-foreground"}`}>{label}</button>)}
            </div>
            <div className="mt-4 space-y-4" role="tabpanel">
              {tab === "resumo" && (
                <>
                  <ul className="grid grid-cols-3 gap-2 text-center">{[["Reservas", p.stats.reservas], ["Vieram", p.stats.concluidas], ["Canceladas", p.stats.canceladas], ["Não vieram", p.stats.nao_compareceu], ["Pessoas", p.stats.pessoas], ["Última", day(p.stats.ultima)]].map(([k, v]) => <li key={String(k)} className="rounded-xl bg-surface p-3"><p className="text-lg font-semibold tabular-nums">{v}</p><p className="text-xs text-muted-foreground">{k}</p></li>)}</ul>
                  <dl className="space-y-2 rounded-2xl bg-surface p-4 text-sm">
                    <Line k="E-mail" v={p.customer.email} /><Line k="Origem" v={sourceLabel(p.customer.source)} />
                    <Line k="WhatsApp" v={p.customer.whatsapp_opt_in ? "Autorizou receber mensagens" : p.customer.whatsapp_opt_out_at ? `Pediu para sair em ${day(p.customer.whatsapp_opt_out_at)}` : "Não autorizou mensagens de marketing"} />
                    <Line k="Observações" v={p.customer.notes} />
                  </dl>
                </>
              )}
              {tab === "reservas" && (p.reservations.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma reserva nas suas unidades.</p> : (
                <ul className="space-y-2">{p.reservations.map((r) => (
                  <li key={r.id} className="rounded-2xl bg-surface p-3.5 text-sm">
                    <div className="flex items-start justify-between gap-2"><p className="font-semibold">{day(r.date)} às {r.time} · {r.party_size} {r.party_size === 1 ? "pessoa" : "pessoas"}</p><StatusBadge status={r.status} /></div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.protocol} · {r.unit}</p>
                    {r.notes && <p className="mt-1 text-xs">{r.notes}</p>}
                  </li>))}</ul>
              ))}
              {tab === "historico" && (timeline.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Sem registros ainda.</p> : (
                <ol className="space-y-2 border-l pl-4">{timeline.map((t, i) => <li key={i} className="relative text-sm"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand" aria-hidden="true" /><p>{t.text}</p><p className="text-xs text-muted-foreground">{t.who} · {dt(t.at)}</p></li>)}</ol>
              ))}
              {tab === "relacionamento" && (
                <div className="space-y-5 text-sm">
                  <Block title="SAC" empty="Nenhum chamado." items={p.sac.map((s) => `${s.protocol} · ${s.subject} (${s.status}) · ${day(s.created_at)}`)} />
                  <Block title="Contatos pelo WhatsApp do site" empty="Nenhum." items={p.leads.map((l) => `${dt(l.created_at)} · ${l.status}${l.campaign ? ` · campanha ${l.campaign}` : ""}`)} />
                  <Block title="Wi-Fi" empty="Nunca conectou." items={p.wifi.map((w) => `${w.visits} ${w.visits === 1 ? "visita" : "visitas"} · última ${dt(w.last_seen_at)}`)} />
                  <Block title="Mensagens do CRM" empty="Nenhuma." items={p.crm.map((c) => `${dt(c.created_at)} · ${c.kind} (${c.status})`)} />
                  <Block title="Consentimentos" empty="Nenhum registro." items={p.consents.map((c) => `${c.granted ? "Autorizou" : "Retirou"} WhatsApp · ${sourceLabel(c.source)} · ${dt(c.at)}`)} />
                </div>
              )}
            </div>
            <ContactForm open={editing} onOpenChange={setEditing} contactId={p.customer.id} initial={p.customer} onSaved={() => { setEditing(false); load(); onChanged(); }} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
const Line = ({ k, v }: { k: string; v: string | null }) => <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v || "—"}</dd></div>;
const Block = ({ title, items, empty }: { title: string; items: string[]; empty: string }) => (
  <section><h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>{items.length === 0 ? <p className="text-muted-foreground">{empty}</p> : <ul className="space-y-1.5">{items.map((t, i) => <li key={i} className="rounded-xl bg-surface px-3 py-2">{t}</li>)}</ul>}</section>
);
