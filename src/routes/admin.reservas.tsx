import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarX, ChevronLeft, ChevronRight, Loader2, Plus, Search, SlidersHorizontal, Users } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/admin/bits";
import { PendingActions } from "@/components/admin/approvals";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQueued } from "@/lib/approvals";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, StatusBadge } from "@/components/admin/bits";
import { ReservationDrawer } from "@/components/admin/ReservationDrawer";
import { NewReservationDialog } from "@/components/admin/NewReservationDialog";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { STATUS_LABEL, fromIsoDate, hhmm, toIsoDate } from "@/lib/format";
import { OCCASION_LABEL, ORIGIN_LABEL, SERVICE_LABEL, formatPhoneE164, periodRange, type OccasionId, type Period, type ServiceId } from "@/lib/reservations";
import { cn } from "@/lib/utils";

type Search = {
  view: "lista" | "calendario";
  cal: "mes" | "semana";
  periodo: Period;
  de?: string | undefined;
  ate?: string | undefined;
  unidade?: string | undefined;
  status?: string | undefined;
  origem?: string | undefined;
  servico?: string | undefined;
  q?: string | undefined;
  pagina: number;
  ref?: string | undefined;
};

const PERIODS: Period[] = ["hoje", "amanha", "semana", "mes", "intervalo", "todas"];
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/admin/reservas")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    view: s["view"] === "calendario" ? "calendario" : "lista",
    cal: s["cal"] === "semana" ? "semana" : "mes",
    periodo: PERIODS.includes(s["periodo"] as Period) ? (s["periodo"] as Period) : "hoje",
    de: str(s["de"]),
    ate: str(s["ate"]),
    unidade: str(s["unidade"]),
    status: str(s["status"]),
    origem: str(s["origem"]),
    servico: str(s["servico"]),
    q: str(s["q"]),
    pagina: Math.max(1, Number(s["pagina"]) || 1),
    ref: str(s["ref"]),
  }),
  head: () => ({ meta: [{ name: "description", content: "Consulta e gestão das reservas da Rede Candeeiro." }, { property: "og:title", content: "Reservas — Candeeiro Gestão" }, { property: "og:description", content: "Consulta e gestão das reservas da Rede Candeeiro." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Reservas — Candeeiro Gestão" }, { name: "robots", content: "noindex" }] }),
  component: Reservas,
});

export type Row = {
  id: string;
  protocol: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  origin: keyof typeof ORIGIN_LABEL;
  status: string;
  is_large_group: boolean;
  notes: string | null;
  service: ServiceId | null;
  occasion: OccasionId | null;
  celebrant_name: string | null;
  campaign: string | null;
  arrived_at: string | null;
  created_at: string;
  unit_id: string;
  customers: { full_name: string; phone_e164: string } | null;
  units: { name: string } | null;
};
type Unit = { id: string; name: string };

const PAGE = 25;
const PERIOD_LABEL: Record<Period, string> = { hoje: "Hoje", amanha: "Amanhã", semana: "Semana", mes: "Mês", intervalo: "Intervalo", todas: "Todas" };

function Reservas() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/reservas" });
  const set = useCallback(
    (patch: Partial<Search>) => navigate({ search: (p) => ({ ...p, pagina: 1, ...patch }), replace: true }),
    [navigate],
  );
  const [units, setUnits] = useState<Unit[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [count, setCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState(search.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isMobile = useIsMobile();
  const queued = useQueued();

  useEffect(() => {
    requireSupabase().from("units").select("id,name").order("sort_order").order("name")
      .then(({ data }) => setUnits((data ?? []) as Unit[]));
  }, []);

  // tempo real
  useEffect(() => {
    const sb = requireSupabase();
    const ch = sb
      .channel(`reservas-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, (payload) => {
        setTick((t) => t + 1);
        const n = payload.new as { status?: string; protocol?: string; party_size?: number } | undefined;
        if (payload.eventType === "INSERT" && n?.status === "pendente") {
          toast("Nova reserva pendente", { description: `${n.protocol} · ${n.party_size} pessoas` });
        }
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  // debounce da busca
  useEffect(() => {
    const t = setTimeout(() => { if ((search.q ?? "") !== q) set({ q: q.trim() || undefined }); }, 350);
    return () => clearTimeout(t);
  }, [q, search.q, set]);

  const range = useMemo(() => periodRange(search.periodo, new Date(), { from: search.de, to: search.ate }), [search.periodo, search.de, search.ate]);

  useEffect(() => {
    if (search.view !== "lista") return;
    let cancelled = false;
    setErr(null);
    const sb = requireSupabase();
    const term = (search.q ?? "").trim();
    const digits = term.replace(/\D/g, "");
    const byProtocol = /^cad-/i.test(term) || /^[A-Z0-9]{5}$/.test(term);
    const byPhone = !byProtocol && digits.length >= 4 && digits.length === term.replace(/[\s()+-]/g, "").length;
    const embed = term && !byProtocol ? "customers!inner(full_name,phone_e164)" : "customers(full_name,phone_e164)";
    let query = sb
      .from("reservations")
      .select(`id,protocol,reservation_date,reservation_time,party_size,origin,status,is_large_group,notes,service,occasion,celebrant_name,campaign,arrived_at,created_at,unit_id,${embed},units(name)`, { count: "exact" });
    if (range.from) query = query.gte("reservation_date", range.from);
    if (range.to) query = query.lte("reservation_date", range.to);
    if (search.unidade) query = query.eq("unit_id", search.unidade);
    if (search.status) query = query.eq("status", search.status);
    if (search.origem) query = query.eq("origin", search.origem);
    if (search.servico) query = query.eq("service", search.servico);
    if (term) {
      if (byProtocol) query = query.ilike("protocol", `%${term}%`);
      else if (byPhone) query = query.ilike("customers.phone_e164", `%${digits}%`);
      else query = query.ilike("customers.full_name", `%${term}%`);
    }
    const from = (search.pagina - 1) * PAGE;
    query
      .order("reservation_date", { ascending: true })
      .order("reservation_time", { ascending: true })
      .range(from, from + PAGE - 1)
      .then(({ data, error, count }) => {
        if (cancelled) return;
        if (error) { setErr(friendlyError(error)); setRows([]); return; }
        setRows((data ?? []) as unknown as Row[]);
        setCount(count ?? 0);
      });
    return () => { cancelled = true; };
  }, [search, range, tick]);

  const pages = Math.max(1, Math.ceil(count / PAGE));
  const hasFilters = Boolean(search.unidade || search.status || search.origem || search.servico || search.q || search.periodo !== "hoje");

  return (
    <div className="fade-up">
      <div className="grid min-w-0 gap-3 sm:flex sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold">Reservas</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-full bg-surface p-1 text-sm">
            {(["lista", "calendario"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={search.view === v} onClick={() => set({ view: v })} className={cn("min-h-10 rounded-full px-4 py-1.5 transition", search.view === v ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>
                {v === "lista" ? "Lista" : "Calendário"}
              </button>
            ))}
          </div>
          <Button className="h-11" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nova reserva</Button>
        </div>
      </div>

      {search.view === "lista" && <div className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-secondary p-1">{(["hoje", "amanha", "semana", "todas"] as const).map((p) => <Button key={p} variant="ghost" aria-pressed={search.periodo === p} className={cn("h-11 rounded-xl px-2", search.periodo === p && "bg-card text-brand-ink shadow-soft")} onClick={() => set({ periodo: p })}>{PERIOD_LABEL[p]}</Button>)}</div>}

      {(() => {
        const filters = (
          <>
            <NativeSelect aria-label="Unidade" value={search.unidade ?? ""} onChange={(e) => set({ unidade: e.target.value || undefined })}>
              <option value="">Todas as unidades</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </NativeSelect>
            <NativeSelect aria-label="Serviço" value={search.servico ?? ""} onChange={(e) => set({ servico: e.target.value || undefined })}><option value="">Todos os serviços</option>{Object.entries(SERVICE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect>
            {search.view === "lista" && (
              <>
                <NativeSelect aria-label="Período" value={search.periodo} onChange={(e) => set({ periodo: e.target.value as Period })}>
                  {PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
                </NativeSelect>
                {search.periodo === "intervalo" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" aria-label="De" value={search.de ?? ""} onChange={(e) => set({ de: e.target.value || undefined })} className="h-11 rounded-xl" />
                    <Input type="date" aria-label="Até" value={search.ate ?? ""} onChange={(e) => set({ ate: e.target.value || undefined })} className="h-11 rounded-xl" />
                  </div>
                )}
                <NativeSelect aria-label="Status" value={search.status ?? ""} onChange={(e) => set({ status: e.target.value || undefined })}>
                  <option value="">Todos os status</option>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </NativeSelect>
                <NativeSelect aria-label="Origem" value={search.origem ?? ""} onChange={(e) => set({ origem: e.target.value || undefined })}>
                  <option value="">Todas as origens</option>
                  {Object.entries(ORIGIN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </NativeSelect>
              </>
            )}
          </>
        );
        const active = [search.unidade, search.status, search.origem, search.servico, search.periodo !== "hoje" ? "p" : undefined].filter(Boolean).length;
        return (
          <>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:hidden">
              {search.view === "lista" ? (
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input type="search" aria-label="Buscar reserva" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar reserva" className="h-11 rounded-xl pl-9" />
                </div>
              ) : <span />}
              <Button variant="outline" className="h-11" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" /> Filtrar{active ? <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{active}</span> : null}
              </Button>
            </div>
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 md:hidden">
                <SheetHeader className="text-left"><SheetTitle>Filtros</SheetTitle></SheetHeader>
                <div className="mt-4 grid gap-3 [&_select]:w-full">{filters}</div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <Button variant="ghost" className="h-12" onClick={() => { set({ unidade: undefined, status: undefined, origem: undefined, servico: undefined, periodo: "hoje", de: undefined, ate: undefined }); }}>Limpar</Button>
                  <Button className="h-12" onClick={() => setFiltersOpen(false)}>Ver resultados</Button>
                </div>
              </SheetContent>
            </Sheet>
            <div className="mt-4 hidden min-w-0 flex-wrap items-center gap-2 md:flex">
              {filters}
              {search.view === "lista" && (
                <div className="relative min-w-56 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input type="search" aria-label="Buscar reserva" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar reserva" className="h-11 rounded-xl pl-9" />
                </div>
              )}
            </div>
          </>
        );
      })()}

      {search.view === "calendario" && isMobile ? (
        <MobileDayView unitId={search.unidade} refDate={search.ref} tick={tick} onRef={(ref) => set({ ref })} onOpen={setOpenId} onChanged={() => setTick((t) => t + 1)} />
      ) : search.view === "calendario" ? (
        <CalendarView
          unitId={search.unidade}
          mode={search.cal}
          refDate={search.ref}
          tick={tick}
          onMode={(cal) => set({ cal })}
          onRef={(ref) => set({ ref })}
          onPick={(day) => set({ view: "lista", periodo: "intervalo", de: day, ate: day })}
        />
      ) : (
        <div className="mt-6 overflow-hidden rounded-3xl bg-card shadow-soft">
          {err ? <ErrorState message={err} onRetry={() => setTick((t) => t + 1)} /> : !rows ? (
            <ListSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState icon={CalendarX} title="Nenhuma reserva encontrada"
              text={hasFilters ? "Tente ampliar o período ou limpar os filtros." : "Quando alguém reservar pela página pública, aparece aqui na hora."}
              action={<>
                {hasFilters && <Button variant="outline" className="h-11" onClick={() => { setQ(""); navigate({ search: { view: "lista", cal: "mes", periodo: "todas", pagina: 1 } }); }}>Ver todas</Button>}
                <Button className="h-11" onClick={() => setCreating(true)}>Criar reserva manual</Button>
              </>} />
          ) : (
            <>
            <div className="divide-y md:hidden">
              {rows.map((r) => (
                <ReservationCard key={r.id} r={r} queued={queued.has(r.id)} onOpen={() => setOpenId(r.id)} onChanged={() => setTick((t) => t + 1)} />
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b">
                    {["Protocolo", "Cliente", "WhatsApp", "Unidade", "Serviço", "Data", "Horário", "Pessoas", "Ocasião", "Origem", "Status", "Criada em"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer border-b last:border-0 transition-colors hover:bg-surface">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{r.protocol}</td>
                      <td className="px-4 py-3 font-medium">{r.customers?.full_name ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{r.customers ? formatPhoneE164(r.customers.phone_e164) : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3">{r.units?.name}</td>
                      <td className="whitespace-nowrap px-4 py-3">{r.service ? SERVICE_LABEL[r.service] : <span className="text-muted-foreground">—</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3">{fromIsoDate(r.reservation_date).toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-3 tabular-nums">{hhmm(r.reservation_time)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 tabular-nums", r.is_large_group && "rounded-full border border-foreground px-2 py-0.5 font-semibold")}>
                          {r.is_large_group && <Users className="h-3 w-3" />}{r.party_size}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {r.occasion && r.occasion !== "nenhuma" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                            {OCCASION_LABEL[r.occasion]}{r.celebrant_name ? ` · ${r.celebrant_name}` : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{ORIGIN_LABEL[r.origin]}</td>
                      <td className="px-4 py-3"><StatusBadge status={queued.has(r.id) ? "confirmada" : r.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
          {rows && rows.length > 0 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
              <span>{count} reserva{count === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" aria-label="Página anterior" disabled={search.pagina <= 1} onClick={() => navigate({ search: (p) => ({ ...p, pagina: p.pagina - 1 }) })}><ChevronLeft className="h-4 w-4" /></Button>
                <span>{search.pagina} de {pages}</span>
                <Button variant="ghost" size="icon" aria-label="Próxima página" disabled={search.pagina >= pages} onClick={() => navigate({ search: (p) => ({ ...p, pagina: p.pagina + 1 }) })}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>
      )}

      <ReservationDrawer id={openId} tick={tick} onClose={() => setOpenId(null)} onChanged={() => setTick((t) => t + 1)} />
      <NewReservationDialog open={creating} units={units} onClose={() => setCreating(false)} onCreated={(id) => { setTick((t) => t + 1); setOpenId(id); }} />
    </div>
  );
}

function CalendarView({ unitId, mode, refDate, tick, onMode, onRef, onPick }: {
  unitId?: string | undefined; mode: "mes" | "semana"; refDate?: string | undefined; tick: number;
  onMode: (m: "mes" | "semana") => void; onRef: (d: string) => void; onPick: (d: string) => void;
}) {
  const ref = refDate ? fromIsoDate(refDate) : new Date();
  const days = useMemo(() => {
    const out: Date[] = [];
    if (mode === "semana") {
      const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ((ref.getDay() + 6) % 7));
      for (let i = 0; i < 7; i++) out.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    } else {
      const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const start = new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() + 6) % 7));
      for (let i = 0; i < 42; i++) out.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, refDate]);
  const [agg, setAgg] = useState<Record<string, { n: number; p: number; pend: number }> | null>(null);

  useEffect(() => {
    setAgg(null);
    let q = requireSupabase()
      .from("reservations")
      .select("reservation_date,party_size,status")
      .gte("reservation_date", toIsoDate(days[0]!))
      .lte("reservation_date", toIsoDate(days[days.length - 1]!))
      .neq("status", "cancelada")
      .limit(5000);
    if (unitId) q = q.eq("unit_id", unitId);
    q.then(({ data }) => {
      const m: Record<string, { n: number; p: number; pend: number }> = {};
      for (const r of (data ?? []) as { reservation_date: string; party_size: number; status: string }[]) {
        const e = (m[r.reservation_date] ??= { n: 0, p: 0, pend: 0 });
        e.n++; e.p += r.party_size; if (r.status === "pendente") e.pend++;
      }
      setAgg(m);
    });
  }, [days, unitId, tick]);

  const shift = (dir: number) => {
    const d = mode === "semana"
      ? new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + dir * 7)
      : new Date(ref.getFullYear(), ref.getMonth() + dir, 1);
    onRef(toIsoDate(d));
  };
  const todayIso = toIsoDate(new Date());
  const title = mode === "semana"
    ? `${days[0]!.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${days[6]!.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}`
    : ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="mt-6 rounded-3xl bg-card p-4 shadow-soft md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Anterior" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <p className="min-w-0 text-center text-sm font-semibold cap1 sm:min-w-40 sm:text-lg">{title}</p>
          <Button variant="ghost" size="icon" aria-label="Próximo" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => onRef(todayIso)}>Hoje</Button>
        </div>
        <div className="flex rounded-full bg-surface p-1 text-sm">
          {(["mes", "semana"] as const).map((m) => (
            <button key={m} onClick={() => onMode(m)} className={cn("rounded-full px-4 py-1.5", mode === m ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>
              {m === "mes" ? "Mês" : "Semana"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = toIsoDate(d);
          const a = agg?.[iso];
          const out = mode === "mes" && d.getMonth() !== ref.getMonth();
          return (
            <button
              key={iso}
              onClick={() => onPick(iso)}
              className={cn(
                "flex min-w-0 flex-col items-start rounded-xl p-1 text-left transition hover:bg-surface sm:p-2",
                mode === "semana" ? "min-h-32" : "min-h-20",
                out && "opacity-40",
                iso === todayIso && "ring-1 ring-foreground",
              )}
            >
              <span className="text-sm font-medium tabular-nums">{d.getDate()}</span>
              {a && (
                <span className="mt-auto text-xs leading-tight">
                  <span className="block font-semibold">{a.n} res.</span>
                  <span className="block text-muted-foreground">{a.p} p.</span>
                  {a.pend > 0 && <span className="mt-0.5 inline-flex items-center gap-1 text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-warning" />{a.pend} pend.</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!agg && <div className="flex justify-center pt-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
    </div>
  );
}

function ReservationCard({ r, queued, onOpen, onChanged }: { r: Row; queued: boolean; onOpen: () => void; onChanged: () => void }) {
  const status = queued ? "confirmada" : r.status;
  const date = fromIsoDate(r.reservation_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return (
    <article className="px-4 py-3.5 text-sm">
      {/* o card inteiro abre a reserva; só as pendentes têm botões (aprovar/recusar) */}
      <button type="button" onClick={onOpen} className="grid w-full grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 text-left" aria-label={`Abrir reserva de ${r.customers?.full_name ?? "cliente"}`}>
        <span className="text-center">
          <span className="block text-lg font-semibold leading-none tabular-nums">{hhmm(r.reservation_time)}</span>
          <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground">{date}</span>
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 break-words text-[15px] font-semibold leading-snug">{r.customers?.full_name ?? "Cliente"}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{r.party_size} {r.party_size === 1 ? "pessoa" : "pessoas"} · {r.units?.name?.replace(/^Candeeiro\s+/, "")}</span>
          </span>
          {r.service && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{SERVICE_LABEL[r.service]}</span>}
          {r.is_large_group && <span className="mt-1 inline-block rounded-full bg-status-pending-bg px-2 py-0.5 text-[11px] font-medium text-status-pending">Grupo grande</span>}
        </span>
        <StatusBadge status={status} />
      </button>
      {status === "pendente" && <PendingActions id={r.id} isLargeGroup={r.is_large_group} onChanged={onChanged} size="default" className="mt-3" />}
    </article>
  );
}

function MobileDayView({ unitId, refDate, tick, onRef, onOpen, onChanged }: {
  unitId?: string | undefined; refDate?: string | undefined; tick: number; onRef: (d: string) => void; onOpen: (id: string) => void; onChanged: () => void;
}) {
  const day = refDate ?? toIsoDate(new Date());
  const queued = useQueued();
  const strip = useMemo(() => {
    const t = new Date(); const start = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 3);
    return Array.from({ length: 31 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true; setRows(null); setErr(null);
    let q = requireSupabase().from("reservations")
      .select("id,protocol,reservation_date,reservation_time,party_size,origin,status,is_large_group,notes,service,occasion,celebrant_name,campaign,arrived_at,created_at,unit_id,customers(full_name,phone_e164),units(name)")
      .eq("reservation_date", day).order("reservation_time").limit(300);
    if (unitId) q = q.eq("unit_id", unitId);
    q.then(({ data, error }) => { if (!alive) return; if (error) { setErr(friendlyError(error)); return; } setRows((data ?? []) as unknown as Row[]); });
    return () => { alive = false; };
  }, [day, unitId, tick, retry]);
  const people = (rows ?? []).filter((r) => r.status !== "cancelada").reduce((s, r) => s + r.party_size, 0);
  return (
    <div className="mt-4">
      <div className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1" role="listbox" aria-label="Escolha o dia">
        {strip.map((d) => {
          const iso = toIsoDate(d); const on = iso === day;
          return (
            <button key={iso} role="option" aria-selected={on} onClick={() => onRef(iso)} ref={on ? (el) => el?.scrollIntoView({ inline: "center", block: "nearest" }) : undefined}
              className={cn("flex h-16 w-14 shrink-0 snap-center flex-col items-center justify-center rounded-2xl text-xs", on ? "bg-primary text-primary-foreground" : "bg-surface")}>
              <span className="cap1">{d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
              <span className="text-lg font-semibold tabular-nums">{d.getDate()}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-muted-foreground"><span className="cap1">{fromIsoDate(day).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span>{rows ? ` · ${rows.length} reservas · ${people} pessoas` : ""}</p>
      <div className="mt-3 overflow-hidden rounded-3xl bg-card shadow-soft">
        {err ? <ErrorState message={err} onRetry={() => setRetry((n) => n + 1)} /> : !rows ? <ListSkeleton rows={3} /> : rows.length === 0 ? (
          <EmptyState icon={CalendarX} title="Sem reservas neste dia" />
        ) : (
          <div className="divide-y">{rows.map((r) => <ReservationCard key={r.id} r={r} queued={queued.has(r.id)} onOpen={() => onOpen(r.id)} onChanged={onChanged} />)}</div>
        )}
      </div>
    </div>
  );
}
