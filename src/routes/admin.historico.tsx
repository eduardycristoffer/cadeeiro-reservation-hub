import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, History, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, ErrorState, ListSkeleton, NativeSelect } from "@/components/admin/bits";
import { AuditTimeline } from "@/components/admin/AuditTimeline";
import { ACTION_OPTIONS, actionLabel, ENTITY_LABEL, SOURCE_LABEL, toCsv, type AuditRow } from "@/lib/audit";
import { useAuth } from "@/lib/auth";
import { friendlyError, requireSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/historico")({
  head: () => ({ meta: [{ title: "Histórico — Candeeiro Gestão" }, { name: "description", content: "Quem fez o quê e quando no painel Candeeiro." }, { property: "og:title", content: "Histórico — Candeeiro Gestão" }, { property: "og:description", content: "Linha do tempo de tudo o que acontece no painel." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Historico,
});

const PAGE = 30;
type F = { actor: string; action: string; entity: string; unit: string; source: string; from: string; to: string };
const EMPTY: F = { actor: "", action: "", entity: "", unit: "", source: "", from: "", to: "" };

function Historico() {
  const { roles } = useAuth();
  const allowed = roles.includes("super_admin") || roles.includes("gestor");
  const [f, setF] = useState<F>(EMPTY);
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [people, setPeople] = useState<{ id: string; full_name: string | null; email: string }[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [sheet, setSheet] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    const sb = requireSupabase();
    sb.rpc("admin_list_team").then(({ data }) => setPeople((data ?? []) as typeof people));
    sb.from("units").select("id,name").order("sort_order").order("name").then(({ data }) => setUnits((data ?? []) as typeof units));
  }, [allowed]);

  const build = useCallback(async (from: number, to: number) => {
    const sb = requireSupabase();
    let query = sb.from("audit_log").select("*").order("created_at", { ascending: false }).range(from, to);
    if (f.actor) query = query.eq("actor_user_id", f.actor);
    if (f.action) query = query.eq("action", f.action);
    if (f.entity) query = query.eq("entity_type", f.entity);
    if (f.unit) query = query.eq("unit_id", f.unit);
    if (f.source) query = query.eq("source", f.source);
    if (f.from) query = query.gte("created_at", new Date(`${f.from}T00:00:00-03:00`).toISOString());
    if (f.to) query = query.lte("created_at", new Date(`${f.to}T23:59:59-03:00`).toISOString());
    const term = qApplied.trim();
    if (term) {
      // protocolo ou telefone → ids das reservas/clientes que o usuário pode ver (RLS)
      const digits = term.replace(/\D/g, "");
      const safe = term.replace(/[%,()*]/g, "");
      const byProto = await sb.from("reservations").select("id,customer_id").ilike("protocol", `%${safe}%`).limit(50);
      let list = (byProto.data ?? []) as { id: string; customer_id: string }[];
      if (digits.length >= 8) {
        const cs = await sb.from("customers").select("id").ilike("phone_e164", `%${digits}%`).limit(20);
        const cids = ((cs.data ?? []) as { id: string }[]).map((c) => c.id);
        if (cids.length) {
          const byCust = await sb.from("reservations").select("id,customer_id").in("customer_id", cids).limit(50);
          list = list.concat((byCust.data ?? []) as typeof list);
          list = list.concat(cids.map((id) => ({ id, customer_id: id })));
        }
      }
      const ids = [...new Set(list.flatMap((r) => [r.id, r.customer_id]))];
      if (ids.length === 0) return { data: [] as AuditRow[], error: null };
      query = query.in("entity_id", ids);
    }
    const { data, error } = await query;
    return { data: (data ?? []) as AuditRow[], error };
  }, [f, qApplied]);

  useEffect(() => {
    if (!allowed) return;
    let cancel = false;
    setRows(null); setErr(null);
    build(page * PAGE, page * PAGE + PAGE).then(({ data, error }) => {
      if (cancel) return;
      if (error) { setErr(friendlyError(error)); setRows([]); return; }
      setHasMore(data.length > PAGE);
      setRows(data.slice(0, PAGE));
    });
    return () => { cancel = true; };
  }, [build, page, allowed]);

  const active = useMemo(() => Object.values(f).filter(Boolean).length, [f]);
  const set = (k: keyof F, v: string) => { setPage(0); setF((p) => ({ ...p, [k]: v })); };

  async function exportCsv() {
    setExporting(true);
    const { data, error } = await build(0, 4999);
    setExporting(false);
    if (error) return setErr(friendlyError(error));
    const blob = new Blob([toCsv(data)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `historico-candeeiro-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!allowed) return <p className="text-muted-foreground">Somente gestores e super admin veem o histórico geral.</p>;

  const filters = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Fld id="h-actor" label="Pessoa"><NativeSelect id="h-actor" value={f.actor} onChange={(e) => set("actor", e.target.value)}><option value="">Todas</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</NativeSelect></Fld>
      <Fld id="h-action" label="Ação"><NativeSelect id="h-action" value={f.action} onChange={(e) => set("action", e.target.value)}><option value="">Todas</option>{ACTION_OPTIONS.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}</NativeSelect></Fld>
      <Fld id="h-entity" label="O quê"><NativeSelect id="h-entity" value={f.entity} onChange={(e) => set("entity", e.target.value)}><option value="">Tudo</option>{Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Fld>
      <Fld id="h-unit" label="Unidade"><NativeSelect id="h-unit" value={f.unit} onChange={(e) => set("unit", e.target.value)}><option value="">Todas</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></Fld>
      <Fld id="h-source" label="Origem"><NativeSelect id="h-source" value={f.source} onChange={(e) => set("source", e.target.value)}><option value="">Todas</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Fld>
      <Fld id="h-from" label="De"><Input id="h-from" type="date" value={f.from} onChange={(e) => set("from", e.target.value)} className="h-11 rounded-xl" /></Fld>
      <Fld id="h-to" label="Até"><Input id="h-to" type="date" value={f.to} onChange={(e) => set("to", e.target.value)} className="h-11 rounded-xl" /></Fld>
      <div className="flex items-end"><Button variant="ghost" className="h-11 w-full" disabled={!active} onClick={() => { setF(EMPTY); setPage(0); }}>Limpar filtros</Button></div>
    </div>
  );

  return (
    <div className="fade-up">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h1 className="truncate text-2xl font-semibold sm:text-4xl">Histórico</h1>
        <Button variant="outline" className="h-11" onClick={exportCsv} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span>CSV</span>
        </Button>
      </div>

      <form className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:grid-cols-[minmax(0,1fr)]" onSubmit={(e) => { e.preventDefault(); setPage(0); setQApplied(q); }}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Buscar por protocolo ou telefone" placeholder="Protocolo ou telefone" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => { setPage(0); setQApplied(q); }} className="h-11 rounded-xl pl-9" />
        </div>
        <Button type="button" variant="outline" className="h-11 md:hidden" onClick={() => setSheet(true)}>
          <SlidersHorizontal className="h-4 w-4" /> Filtrar{active ? ` (${active})` : ""}
        </Button>
      </form>
      <div className="mt-4 hidden md:block">{filters}</div>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 md:hidden">
          <SheetHeader className="text-left"><SheetTitle>Filtros</SheetTitle></SheetHeader>
          <div className="mt-4">{filters}</div>
          <Button className="mt-4 h-12 w-full" onClick={() => setSheet(false)}>Ver resultados</Button>
        </SheetContent>
      </Sheet>

      <div className="mt-5">
        {err ? <ErrorState message={err} onRetry={() => setPage((p) => p)} />
          : !rows ? <ListSkeleton />
          : rows.length === 0 ? <EmptyState icon={History} title="Nada encontrado" text={active || qApplied ? "Tente outros filtros." : "As ações do painel aparecem aqui."} />
          : <AuditTimeline rows={rows} />}
      </div>
      {rows && (page > 0 || hasMore) && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anteriores</Button>
          <Button variant="outline" className="h-11" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>Mais antigos</Button>
        </div>
      )}
    </div>
  );
}

function Fld({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
