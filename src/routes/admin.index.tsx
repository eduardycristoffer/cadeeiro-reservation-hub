import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronRight, Clock, Headset, Plus, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, StatusBadge } from "@/components/admin/bits";
import { NewReservationDialog } from "@/components/admin/NewReservationDialog";
import { ReservationDrawer } from "@/components/admin/ReservationDrawer";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { hhmm, toIsoDate } from "@/lib/format";
import { usePendingCount, useQueued } from "@/lib/approvals";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [
    { title: "Hoje — Candeeiro Gestão" },
    { name: "description", content: "Reservas e pessoas previstas na Rede Candeeiro." },
    { property: "og:title", content: "Hoje — Candeeiro Gestão" },
    { property: "og:description", content: "Reservas e pessoas previstas na Rede Candeeiro." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "robots", content: "noindex" },
  ] }),
  component: AdminHome,
});

const ROLE_LABEL = { super_admin: "Super Admin", gestor: "Gestor", funcionario: "Funcionário" } as const;
type TodayRow = { id: string; reservation_time: string; party_size: number; status: string; customers: { full_name: string } | null; units: { name: string } | null };
type Data = { rows: TodayRow[]; sac: number | null };

async function load(): Promise<Data> {
  const sb = requireSupabase();
  const today = toIsoDate(new Date());
  const [r, s] = await Promise.all([
    sb.from("reservations").select("id,reservation_time,party_size,status,customers(full_name),units(name)")
      .eq("reservation_date", today).in("status", ["pendente", "confirmada", "concluida"]).order("reservation_time").limit(300),
    sb.from("sac_tickets").select("id", { count: "exact", head: true }).in("status", ["aberto", "em_andamento", "aguardando_cliente"]),
  ]);
  if (r.error) throw r.error;
  return { rows: (r.data ?? []) as unknown as TodayRow[], sac: s.error ? null : s.count ?? 0 };
}

function AdminHome() {
  const { roles } = useAuth();
  const pending = usePendingCount();
  const queued = useQueued();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => { setErr(null); load().then(setData).catch((e) => setErr(friendlyError(e))); }, [tick, pending]);
  useEffect(() => { requireSupabase().from("units").select("id,name").order("sort_order").order("name").then(({ data }) => setUnits((data ?? []) as { id: string; name: string }[])); }, []);

  const people = data?.rows.reduce((s, r) => s + r.party_size, 0) ?? 0;
  const groups = new Map<string, TodayRow[]>();
  for (const r of data?.rows ?? []) { const k = hhmm(r.reservation_time); groups.set(k, [...(groups.get(k) ?? []), r]); }

  return (
    <div className="fade-up">
      <p className="text-sm text-muted-foreground">{roles.map((r) => ROLE_LABEL[r]).join(" · ")}</p>
      <h1 className="mt-1 text-4xl font-semibold">Hoje</h1>
      <p className="text-sm capitalize text-muted-foreground">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>

      {pending ? (
        <Link to="/admin/aprovacoes" className="mt-5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-3xl bg-status-pending-bg p-4 text-status-pending shadow-soft sm:p-5">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          <span className="min-w-0"><span className="block text-lg font-semibold">{pending} aguardando aprovação</span><span className="block text-sm">Toque para aprovar ou recusar</span></span>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
        <Stat icon={CalendarDays} label="Reservas" value={data ? data.rows.length : null} />
        <Stat icon={Users} label="Pessoas" value={data ? people : null} />
        <Stat icon={Headset} label="SAC aberto" value={data ? (data.sac ?? "—") : null} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button className="h-12 px-2 text-sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nova</Button>
        <Button asChild variant="outline" className="h-12 px-2 text-sm"><Link to="/admin/aprovacoes">Aprovações</Link></Button>
        <Button asChild variant="outline" className="h-12 px-2 text-sm"><Link to="/admin/reservas" search={{ view: "lista", cal: "mes", periodo: "hoje", pagina: 1 }}>Ver hoje</Link></Button>
      </div>

      <section className="mt-6 overflow-hidden rounded-3xl bg-card shadow-soft">
        <h2 className="border-b px-4 py-3 text-base font-semibold sm:px-6">Reservas de hoje por horário</h2>
        {err ? <ErrorState message={err} onRetry={refresh} /> : !data ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : data.rows.length === 0 ? (
          <EmptyState icon={Clock} title="Nenhuma reserva para hoje" action={<Button className="h-11" onClick={() => setCreating(true)}>Criar reserva</Button>} />
        ) : (
          <ol className="divide-y">
            {[...groups.entries()].map(([time, list]) => (
              <li key={time} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 px-4 py-3 sm:px-6">
                <span className="pt-2.5 text-sm font-semibold tabular-nums">{time}</span>
                <ul className="min-w-0 space-y-1">
                  {list.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => setOpenId(r.id)} className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-surface">
                        <span className="min-w-0 truncate"><span className="font-medium">{r.customers?.full_name ?? "Cliente"}</span><span className="text-muted-foreground"> · {r.party_size} p · {r.units?.name}</span></span>
                        <StatusBadge status={queued.has(r.id) ? "confirmada" : r.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      <ReservationDrawer id={openId} tick={tick} onClose={() => setOpenId(null)} onChanged={refresh} />
      <NewReservationDialog open={creating} units={units} onClose={() => setCreating(false)} onCreated={(id) => { refresh(); setOpenId(id); }} />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number | string | null }) {
  return (
    <div className="min-w-0 rounded-2xl bg-card p-3 shadow-soft sm:rounded-3xl sm:p-5">
      <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground sm:text-sm"><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{label}</p>
      {value === null ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-4xl">{value}</p>}
    </div>
  );
}
