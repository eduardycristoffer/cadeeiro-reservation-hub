import { useEffect, useState } from "react";
import { requireSupabase } from "@/lib/supabase";
import { toIsoDate } from "@/lib/format";

export const UNDO_MS = 8000;

export const REJECT_REASONS = ["Sem mesa disponível", "Horário indisponível", "Cliente pediu cancelamento", "Cliente não respondeu", "Duplicada", "Outro"] as const;

export function validReason(reason: string, extra: string): boolean {
  return (REJECT_REASONS as readonly string[]).includes(reason) && (reason !== "Outro" || extra.trim().length > 0);
}
export function cancellationNote(reason: string, extra = "", refused = false): string {
  if (!validReason(reason, extra)) throw new Error("Escolha o motivo e detalhe Outro.");
  return `${refused ? "Recusada" : "Cancelada"}: ${reason}${extra.trim() ? ` — ${extra.trim()}` : ""}`;
}

/** Nota gravada no histórico ao recusar (o RPC exige um motivo não vazio). */
export function rejectNote(reason: string, extra?: string): string {
  const e = (extra ?? "").trim();
  const r = reason.trim() || "Outro";
  return e ? `Recusada: ${r} — ${e}` : `Recusada: ${r}`;
}

/** Ordem da fila: data/hora da reserva mais próxima primeiro; empate, a pedida há mais tempo. */
export function sortPending<T extends { reservation_date: string; reservation_time: string; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.reservation_date.localeCompare(b.reservation_date)
    || a.reservation_time.localeCompare(b.reservation_time)
    || a.created_at.localeCompare(b.created_at));
}

// ---- aprovação com "Desfazer": o status só é gravado depois da janela de desfazer
type Job = { timer: ReturnType<typeof setTimeout>; commit: () => void };
const jobs = new Map<string, Job>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function queuedIds(): Set<string> { return new Set(jobs.keys()); }
export function useQueued(): Set<string> {
  const [s, setS] = useState(queuedIds);
  useEffect(() => { const l = () => setS(queuedIds()); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return s;
}

export function scheduleApproval(ids: string[], onResult: (failed: { id: string; error: unknown }[]) => void): () => void {
  let done = false;
  const commit = async () => {
    if (done) return; done = true;
    clearTimeout(timer);
    const sb = requireSupabase();
    const failed: { id: string; error: unknown }[] = [];
    for (const id of ids) {
      try {
        const { error } = await sb.rpc("set_reservation_status", { _reservation_id: id, _status: "confirmada", _note: null });
        if (error) failed.push({ id, error });
      } catch (error) { failed.push({ id, error }); }
    }
    ids.forEach((id) => jobs.delete(id)); emit();
    onResult(failed);
  };
  const timer = setTimeout(commit, UNDO_MS);
  ids.forEach((id) => jobs.set(id, { timer, commit }));
  emit();
  return () => { if (done) return; done = true; clearTimeout(timer); ids.forEach((id) => jobs.delete(id)); emit(); };
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { new Set([...jobs.values()]).forEach((j) => j.commit()); });
}

/** Contador de pendências (hoje em diante), atualizado em tempo real. */
export function usePendingCount(): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const sb = requireSupabase();
    let alive = true;
    const load = () => sb.from("reservations").select("id", { count: "exact", head: true })
      .eq("status", "pendente").gte("reservation_date", toIsoDate(new Date()))
      .then(({ count }) => { if (alive) setN(count ?? 0); });
    load();
    const ch = sb.channel(`pend-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => { load(); })
      .subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
  }, []);
  return n;
}
