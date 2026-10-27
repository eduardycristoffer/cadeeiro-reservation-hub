import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/admin/bits";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { toIsoDate } from "@/lib/format";

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

type Stats = { today: number; tomorrow: number; pending: number; peopleToday: number };

async function loadStats(): Promise<Stats> {
  const sb = requireSupabase();
  const now = new Date();
  const today = toIsoDate(now);
  const t = new Date(now); t.setDate(t.getDate() + 1);
  const tomorrow = toIsoDate(t);
  const active = ["pendente", "confirmada", "concluida"];
  const [a, b, c, d] = await Promise.all([
    sb.from("reservations").select("id", { count: "exact", head: true }).eq("reservation_date", today).in("status", active),
    sb.from("reservations").select("id", { count: "exact", head: true }).eq("reservation_date", tomorrow).in("status", active),
    sb.from("reservations").select("id", { count: "exact", head: true }).eq("status", "pendente").gte("reservation_date", today),
    sb.from("reservations").select("party_size").eq("reservation_date", today).in("status", active),
  ]);
  const err = a.error || b.error || c.error || d.error;
  if (err) throw err;
  return {
    today: a.count ?? 0,
    tomorrow: b.count ?? 0,
    pending: c.count ?? 0,
    peopleToday: ((d.data ?? []) as { party_size: number }[]).reduce((s, r) => s + r.party_size, 0),
  };
}

function AdminHome() {
  const { roles } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadStats().then(setStats).catch((e) => setErr(friendlyError(e)));
  }, []);

  return (
    <div className="fade-up">
      <p className="text-sm text-muted-foreground">{roles.map((r) => ROLE_LABEL[r]).join(" · ")}</p>
      <h1 className="mt-1 text-4xl font-semibold">Visão de hoje</h1>
      {err && <p className="mt-6 text-destructive">{err}</p>}
      {!stats && !err ? (
        <div className="mt-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : stats && (
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Reservas hoje" value={stats.today} hint="Sem canceladas" />
          <StatCard label="Reservas amanhã" value={stats.tomorrow} hint="Sem canceladas" />
          <StatCard label="Pendentes" value={stats.pending} hint="Aguardando confirmação" />
          <StatCard label="Pessoas previstas hoje" value={stats.peopleToday} />
        </div>
      )}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg"><Link to="/admin/reservas" search={{ view: "lista", cal: "mes", periodo: "hoje", pagina: 1 }}>Ver reservas</Link></Button>
        <Button asChild size="lg" variant="outline"><a href="/reservar" target="_blank" rel="noreferrer">Abrir página de reservas</a></Button>
      </div>
    </div>
  );
}
