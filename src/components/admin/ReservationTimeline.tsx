import { useEffect, useState } from "react";
import { AuditTimeline, type TimelineItem } from "@/components/admin/AuditTimeline";
import { ErrorState, ListSkeleton } from "@/components/admin/bits";
import { friendlyError, requireSupabase } from "@/lib/supabase";

/** Histórico completo da reserva: quem criou/aprovou/recusou, alterações do cliente e WhatsApps automáticos. */
export function ReservationTimeline({ id, status }: { id: string; status: string }) {
  const [rows, setRows] = useState<TimelineItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancel = false;
    setRows(null); setErr(null);
    requireSupabase().rpc("get_reservation_timeline", { _reservation_id: id }).then(({ data, error }) => {
      if (cancel) return;
      if (error) setErr(friendlyError(error));
      setRows((data ?? []) as TimelineItem[]);
    });
    return () => { cancel = true; };
  }, [id, status, retry]);
  return (
    <section className="mt-6">
      <h3 className="text-sm font-medium">Histórico</h3>
      <div className="mt-2">
        {err ? <ErrorState message={err} onRetry={() => setRetry((n) => n + 1)} />
          : !rows ? <ListSkeleton rows={2} />
          : rows.length === 0 ? <p className="text-sm text-muted-foreground">Os eventos a partir de agora aparecem aqui.</p>
          : <AuditTimeline rows={rows} showEntity={false} />}
      </div>
    </section>
  );
}
