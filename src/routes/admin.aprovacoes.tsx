import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, MessageCircle, Phone, PartyPopper, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/admin/bits";
import { PendingActions, approve, useCanManage } from "@/components/admin/approvals";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { fromIsoDate, hhmm, toIsoDate } from "@/lib/format";
import { OCCASION_LABEL, SERVICE_LABEL, canConfirmLargeGroup, formatPhoneE164, waLink, type OccasionId, type ServiceId } from "@/lib/reservations";
import { sortPending, useQueued } from "@/lib/approvals";

export const Route = createFileRoute("/admin/aprovacoes")({
  head: () => ({ meta: [
    { title: "Aprovações — Candeeiro Gestão" },
    { name: "description", content: "Reservas aguardando aprovação na Rede Candeeiro." },
    { property: "og:title", content: "Aprovações — Candeeiro Gestão" },
    { property: "og:description", content: "Reservas aguardando aprovação." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Aprovacoes,
});

type P = {
  id: string; protocol: string; reservation_date: string; reservation_time: string; party_size: number;
  is_large_group: boolean; occasion: OccasionId | null; celebrant_name: string | null; notes: string | null;
  service: ServiceId | null; created_at: string;
  customers: { full_name: string; phone_e164: string } | null; units: { name: string } | null;
};

function Aprovacoes() {
  const [rows, setRows] = useState<P[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const queued = useQueued();
  const canManage = useCanManage();
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setErr(null);
    requireSupabase().from("reservations")
      .select("id,protocol,reservation_date,reservation_time,party_size,is_large_group,occasion,celebrant_name,notes,service,created_at,customers(full_name,phone_e164),units(name)")
      .eq("status", "pendente").gte("reservation_date", toIsoDate(new Date())).limit(200)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { setErr(friendlyError(error)); setRows([]); return; }
        setRows(sortPending((data ?? []) as unknown as P[]));
      });
    return () => { alive = false; };
  }, [tick]);

  useEffect(() => {
    const sb = requireSupabase();
    const ch = sb.channel(`aprov-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, refresh).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [refresh]);

  const visible = useMemo(() => (rows ?? []).filter((r) => !queued.has(r.id)), [rows, queued]);
  const approvable = visible.filter((r) => canConfirmLargeGroup(r.is_large_group, canManage));
  const selected = approvable.filter((r) => sel.has(r.id)).map((r) => r.id);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulk = (ids: string[]) => { approve(ids, refresh); setSel(new Set()); };

  return (
    <div className="fade-up">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold">Aprovações</h1>
          <p className="mt-1 text-sm text-muted-foreground">{rows ? `${visible.length} aguardando` : "Carregando…"}</p>
        </div>
        {approvable.length > 1 && (
          <Button variant="success" className="h-11" onClick={() => bulk(selected.length ? selected : approvable.map((r) => r.id))}>
            <CheckCheck className="h-4 w-4" /> {selected.length ? `Aprovar ${selected.length}` : "Aprovar todas"}
          </Button>
        )}
      </div>

      {err ? <ErrorState message={err} onRetry={refresh} /> : !rows ? <ListSkeleton /> : visible.length === 0 ? (
        <div className="mt-6 rounded-3xl bg-card shadow-soft">
          <EmptyState icon={CheckCheck} title="Tudo em dia" text="Nenhuma reserva aguardando aprovação. Novos pedidos aparecem aqui na hora." />
        </div>
      ) : (
        <ul className="mt-5 grid gap-3 lg:grid-cols-2">
          {visible.map((r) => {
            const can = canConfirmLargeGroup(r.is_large_group, canManage);
            return (
              <li key={r.id} className="min-w-0 rounded-3xl bg-card p-4 shadow-soft sm:p-5">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                  {can && approvable.length > 1 ? (
                    <Checkbox className="mt-1 h-6 w-6" checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Selecionar ${r.customers?.full_name ?? "reserva"}`} />
                  ) : <span className="w-0" />}
                  <div className="min-w-0">
                    <p className="break-words text-lg font-semibold leading-tight">{r.customers?.full_name ?? "Cliente"}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{r.units?.name}{r.service ? ` · ${SERVICE_LABEL[r.service]}` : ""}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-status-pending-bg px-2.5 py-1 text-sm font-semibold text-status-pending">
                    <Users className="h-4 w-4" aria-hidden="true" />{r.party_size}<span className="sr-only"> pessoas</span>
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="min-w-0 text-base"><span className="font-semibold tabular-nums">{hhmm(r.reservation_time)}</span> · <span className="cap1">{fromIsoDate(r.reservation_date).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "")}</span></p>
                  {r.customers && (
                    <div className="flex shrink-0 gap-2">
                      <Button asChild variant="outline" size="icon" className="h-11 w-11 rounded-full"><a href={`tel:${r.customers.phone_e164}`} aria-label={`Ligar para ${formatPhoneE164(r.customers.phone_e164)}`}><Phone className="h-[18px] w-[18px]" /></a></Button>
                      <Button asChild variant="outline" size="icon" className="h-11 w-11 rounded-full"><a href={waLink(r.customers.phone_e164)} target="_blank" rel="noreferrer" aria-label="Chamar no WhatsApp"><MessageCircle className="h-[18px] w-[18px]" /></a></Button>
                    </div>
                  )}
                </div>
                {r.occasion && r.occasion !== "nenhuma" && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-sm"><PartyPopper className="h-4 w-4 text-brand-ink" aria-hidden="true" />{OCCASION_LABEL[r.occasion]}{r.celebrant_name ? ` · ${r.celebrant_name}` : ""}</p>
                )}
                {r.notes && <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-surface p-3 text-sm">{r.notes}</p>}
                <PendingActions id={r.id} isLargeGroup={r.is_large_group} onChanged={refresh} className="mt-3" />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
