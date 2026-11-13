import { ReservationTimeline } from "@/components/admin/ReservationTimeline";
import { useEffect, useState } from "react";
import { Loader2, MessageCircle, MoreHorizontal, Phone, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PendingActions, RejectSheet } from "@/components/admin/approvals";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/admin/bits";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { STATUS_LABEL, formatDateLong, hhmm } from "@/lib/format";
import { OCCASION_LABEL, ORIGIN_LABEL, SERVICE_LABEL, TRANSITIONS, formatPhoneE164, waLink, type OccasionId, type ReservationStatus, type ServiceId } from "@/lib/reservations";

type Detail = {
  id: string; protocol: string; reservation_date: string; reservation_time: string; party_size: number;
  origin: keyof typeof ORIGIN_LABEL; status: ReservationStatus; is_large_group: boolean; notes: string | null;
  service: ServiceId | null; occasion: OccasionId | null; celebrant_name: string | null; campaign: string | null;
  arrived_at: string | null; created_at: string;
  customers: { full_name: string; phone_e164: string; whatsapp_opt_in: boolean } | null;
  units: { name: string } | null;
};
type Hist = { id: string; from_status: string | null; to_status: string; note: string | null; created_at: string; changed_by_name: string | null };

const ACTION_LABEL: Record<string, string> = {
  confirmada: "Confirmar", cancelada: "Cancelar", concluida: "Concluir", nao_compareceu: "Não compareceu",
};

export function ReservationDrawer({ id, tick, onClose, onChanged }: { id: string | null; tick: number; onClose: () => void; onChanged: () => void }) {
  const [r, setR] = useState<Detail | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelMode, setCancelMode] = useState(false);
  const [note, setNote] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!id) { setR(null); return; }
    let cancelled = false;
    setR(null); setHist([]); setLoadError(null); setHistoryError(null);
    const sb = requireSupabase();
    sb.from("reservations")
      .select("id,protocol,reservation_date,reservation_time,party_size,origin,status,is_large_group,notes,service,occasion,celebrant_name,campaign,arrived_at,created_at,customers(full_name,phone_e164,whatsapp_opt_in),units(name)")
      .eq("id", id).maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) { setLoadError(error ? friendlyError(error) : "Reserva não encontrada ou sem acesso."); return; }
        setR(data as unknown as Detail);
      });
    sb.rpc("get_reservation_history", { _reservation_id: id }).then(({ data, error }) => {
      if (cancelled) return;
      setHistoryError(error ? friendlyError(error) : null);
      setHist((data ?? []) as Hist[]);
    });
    return () => { cancelled = true; };
  }, [id, tick, retry]);

  useEffect(() => { setCancelMode(false); setNote(""); setNoteOpen(false); }, [id]);

  async function run(key: string, fn: () => PromiseLike<{ error: unknown }>, ok: string) {
    setBusy(key);
    try {
      const { error } = await fn();
      if (error) { toast.error(friendlyError(error)); return false; }
      toast.success(ok);
      onChanged();
      return true;
    } catch (error) { toast.error(friendlyError(error)); return false; }
    finally { setBusy(null); }
  }
  const sb = () => requireSupabase();

  const changeStatus = (to: ReservationStatus, n?: string) => {
    if (!r) return Promise.resolve(false);
    return run(to, () => sb().rpc("set_reservation_status", { _reservation_id: r.id, _status: to, _note: n ?? null }), `Status: ${STATUS_LABEL[to]}`);
  };

  const secondary = r ? TRANSITIONS[r.status].filter((to) => to !== "confirmada" && to !== "cancelada") : [];
  const canCancel = r ? TRANSITIONS[r.status].includes("cancelada") : false;

  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={isMobile ? "flex h-[92dvh] flex-col gap-0 rounded-t-3xl p-0" : "flex w-full flex-col gap-0 p-0 sm:max-w-lg"}>
        {loadError ? <div className="p-6"><SheetTitle className="sr-only">Reserva</SheetTitle><p role="alert" className="py-10 text-sm">{loadError}</p><Button variant="outline" onClick={() => setRetry((n) => n + 1)}>Tentar de novo</Button></div> : !r ? (
          <div className="flex h-full items-center justify-center"><SheetTitle className="sr-only">Carregando reserva</SheetTitle><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <SheetHeader className="shrink-0 border-b px-4 pb-3 pr-14 pt-4 text-left sm:px-6">
              <SheetDescription className="font-mono text-xs">{r.protocol}</SheetDescription>
              <SheetTitle className="break-words text-xl sm:text-2xl">{r.customers?.full_name ?? "Cliente"}</SheetTitle>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <StatusBadge status={r.status} />
                {r.is_large_group && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-foreground px-2.5 py-1 text-xs font-semibold">
                    <Users className="h-3 w-3" aria-hidden="true" /> Grupo grande
                  </span>
                )}
                {r.arrived_at && <span className="rounded-full bg-status-done-bg px-2.5 py-1 text-xs font-semibold text-status-done">Chegou às {new Date(r.arrived_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
            <dl className="mt-4 divide-y rounded-2xl bg-surface px-4 text-sm">
              <Item k="Unidade" v={r.units?.name ?? "—"} />
              {r.service && <Item k="Serviço" v={SERVICE_LABEL[r.service]} />}
              <Item k="Data" v={<span className="cap1">{formatDateLong(r.reservation_date)}</span>} />
              <Item k="Horário" v={hhmm(r.reservation_time)} />
              <Item k="Pessoas" v={String(r.party_size)} />
              {r.occasion && r.occasion !== "nenhuma" && (
                <Item k="Ocasião" v={r.celebrant_name ? `${OCCASION_LABEL[r.occasion]} · ${r.celebrant_name}` : OCCASION_LABEL[r.occasion]} />
              )}
              <Item k="Origem" v={ORIGIN_LABEL[r.origin]} />
              {r.campaign && <Item k="Campanha" v={r.campaign} />}
              <Item k="WhatsApp" v={r.customers ? formatPhoneE164(r.customers.phone_e164) : "—"} />
              <Item k="Criada em" v={new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} />
            </dl>
            {r.customers && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button asChild variant="outline" className="h-11"><a href={`tel:${r.customers.phone_e164}`}><Phone className="h-4 w-4" /> Ligar</a></Button>
                <Button asChild variant="outline" className="h-11"><a href={waLink(r.customers.phone_e164)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a></Button>
              </div>
            )}

            {r.notes && (
              <section className="mt-6">
                <h3 className="text-sm font-medium">Observação do cliente</h3>
                <p className="mt-1 whitespace-pre-wrap rounded-2xl bg-surface p-3 text-sm">{r.notes}</p>
              </section>
            )}

            {noteOpen && (
              <section className="mt-6">
                <label htmlFor="internal-note" className="text-sm font-medium">Observação interna</label>
                <Textarea id="internal-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ex.: mesa perto da janela" className="mt-2 rounded-xl" />
                <Button variant="outline" className="mt-2 h-11" disabled={!note.trim() || !!busy}
                  onClick={async () => { if (await run("note", () => sb().rpc("add_reservation_note", { _reservation_id: r.id, _note: note.trim() }), "Observação registrada")) { setNote(""); setNoteOpen(false); } }}>
                  Salvar observação
                </Button>
              </section>
            )}

            <section className="mt-6">
              <h3 className="text-sm font-medium">Status e observações</h3>
              {historyError && <p role="alert" className="mt-2 text-sm text-destructive">{historyError}</p>}
              <ol className="mt-2 space-y-3 border-l pl-4">
                {hist.map((h) => (
                  <li key={h.id} className="text-sm">
                    <p className="font-medium">
                      {h.from_status === null ? `Criada como ${STATUS_LABEL[h.to_status]}`
                        : h.from_status === h.to_status ? "Observação"
                        : `${STATUS_LABEL[h.from_status]} → ${STATUS_LABEL[h.to_status]}`}
                    </p>
                    {h.note && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{h.note}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {h.changed_by_name ?? "Cliente / sistema"}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <ReservationTimeline id={r.id} status={r.status} />
            </div>

            <footer className="safe-bottom shrink-0 border-t bg-background px-4 pt-3 sm:px-6" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {r.status === "pendente" ? (
                    <PendingActions id={r.id} isLargeGroup={r.is_large_group} onChanged={() => { onChanged(); onClose(); }} />
                  ) : r.status === "confirmada" && !r.arrived_at ? (
                    <Button className="h-12 w-full text-base" disabled={!!busy} onClick={() => run("arrived", () => sb().rpc("mark_reservation_arrived", { _reservation_id: r.id }), "Chegada registrada")}>
                      {busy === "arrived" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar chegada"}
                    </Button>
                  ) : r.status === "confirmada" ? (
                    <Button className="h-12 w-full text-base" disabled={!!busy} onClick={() => changeStatus("concluida")}>
                      {busy === "concluida" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Concluir"}
                    </Button>
                  ) : (
                    <p className="flex h-12 items-center text-sm text-muted-foreground">Status final.</p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-12 w-12 shrink-0" aria-label="Mais ações"><MoreHorizontal className="h-5 w-5" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuItem className="min-h-11" onSelect={() => setNoteOpen(true)}>Adicionar observação</DropdownMenuItem>
                    {r.status === "confirmada" && secondary.map((to) => (
                      <DropdownMenuItem key={to} className="min-h-11" disabled={!!busy} onSelect={() => { void changeStatus(to); }}>{ACTION_LABEL[to]}</DropdownMenuItem>
                    ))}
                    {canCancel && r.status !== "pendente" && (
                      <DropdownMenuItem className="min-h-11 text-destructive" onSelect={() => setCancelMode(true)}>Cancelar reserva</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </footer>
          </>
        )}
      </SheetContent>
      <RejectSheet ids={cancelMode && r ? [r.id] : []} refused={false} onClose={() => setCancelMode(false)} onDone={() => { onChanged(); onClose(); }} />
    </Sheet>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-2.5">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="break-words text-right font-medium">{v}</dd>
    </div>
  );
}
