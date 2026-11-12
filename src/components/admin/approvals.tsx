import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { canConfirmLargeGroup } from "@/lib/reservations";
import { REJECT_REASONS, UNDO_MS, rejectNote, scheduleApproval } from "@/lib/approvals";
import { cn } from "@/lib/utils";

export function useCanManage() {
  const { roles } = useAuth();
  return roles.includes("super_admin") || roles.includes("gestor");
}

/** Aprova com 1 toque; o status só é gravado após a janela de "Desfazer". */
export function approve(ids: string[], onChanged: () => void) {
  if (ids.length === 0) return;
  const undo = scheduleApproval(ids, (failed) => {
    if (failed.length) toast.error(failed.length === ids.length ? `Não foi possível aprovar: ${friendlyError(failed[0]!.error)}` : `${failed.length} de ${ids.length} não foram aprovadas: ${friendlyError(failed[0]!.error)}`);
    onChanged();
  });
  toast.success(ids.length === 1 ? "Reserva aprovada — cliente avisado por WhatsApp" : `${ids.length} reservas aprovadas — clientes avisados por WhatsApp`, {
    duration: UNDO_MS,
    action: { label: "Desfazer", onClick: () => { undo(); toast("Aprovação desfeita"); onChanged(); } },
  });
  onChanged();
}

export function PendingActions({ id, isLargeGroup, onChanged, className, size = "lg" }: {
  id: string; isLargeGroup: boolean; onChanged: () => void; className?: string; size?: "lg" | "default";
}) {
  const canManage = useCanManage();
  const [rejecting, setRejecting] = useState(false);
  const allowed = canConfirmLargeGroup(isLargeGroup, canManage);
  const h = size === "lg" ? "h-12 text-base" : "h-11";
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="success" className={cn(h, "font-semibold")} disabled={!allowed} onClick={(e) => { e.stopPropagation(); approve([id], onChanged); }}>
          <Check className="h-5 w-5" aria-hidden="true" /> Aprovar
        </Button>
        <Button variant="destructive" className={cn(h, "font-semibold")} onClick={(e) => { e.stopPropagation(); setRejecting(true); }}>
          <X className="h-5 w-5" aria-hidden="true" /> Recusar
        </Button>
      </div>
      {!allowed && <p className="mt-2 text-xs text-muted-foreground">Grupo grande: só gestor aprova.</p>}
      <RejectSheet ids={rejecting ? [id] : []} onClose={() => setRejecting(false)} onDone={onChanged} />
    </div>
  );
}

export function RejectSheet({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  async function reject(reason: string) {
    setBusy(reason);
    try {
      const sb = requireSupabase();
      for (const id of ids) {
        const { error } = await sb.rpc("set_reservation_status", { _reservation_id: id, _status: "cancelada", _note: rejectNote(reason, extra) });
        if (error) throw error;
      }
      toast.success(ids.length === 1 ? "Reserva recusada — cliente avisado por WhatsApp" : "Reservas recusadas — clientes avisados por WhatsApp");
      setExtra(""); onClose(); onDone();
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setBusy(null); }
  }
  return (
    <Sheet open={ids.length > 0} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-3xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5" onClick={(e) => e.stopPropagation()}>
        <SheetHeader className="text-left">
          <SheetTitle>Recusar reserva</SheetTitle>
          <SheetDescription>Toque no motivo. O cliente será avisado por WhatsApp.</SheetDescription>
        </SheetHeader>
        <label className="mt-4 block text-sm font-medium" htmlFor="reject-extra">Detalhe (opcional)</label>
        <Textarea id="reject-extra" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={300} rows={2} className="mt-1 rounded-xl" placeholder="Ex.: sugerimos 21h" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          {REJECT_REASONS.map((r) => (
            <Button key={r} variant="outline" className="h-12 whitespace-normal rounded-2xl text-sm" disabled={!!busy} onClick={() => reject(r)}>
              {busy === r ? <Loader2 className="h-4 w-4 animate-spin" /> : r}
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
