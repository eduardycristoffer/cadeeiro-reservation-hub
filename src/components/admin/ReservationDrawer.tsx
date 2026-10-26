import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/admin/bits";
import { useAuth } from "@/lib/auth";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { STATUS_LABEL, formatDateLong, hhmm } from "@/lib/format";
import { ORIGIN_LABEL, TRANSITIONS, canConfirmLargeGroup, formatPhoneE164, waLink, type ReservationStatus } from "@/lib/reservations";

type Detail = {
  id: string; protocol: string; reservation_date: string; reservation_time: string; party_size: number;
  origin: keyof typeof ORIGIN_LABEL; status: ReservationStatus; is_large_group: boolean; notes: string | null;
  arrived_at: string | null; created_at: string;
  customers: { full_name: string; phone_e164: string; whatsapp_opt_in: boolean } | null;
  units: { name: string } | null;
};
type Hist = { id: string; from_status: string | null; to_status: string; note: string | null; created_at: string; changed_by_name: string | null };

const ACTION_LABEL: Record<string, string> = {
  confirmada: "Confirmar", cancelada: "Cancelar", concluida: "Concluir", nao_compareceu: "Não compareceu",
};

export function ReservationDrawer({ id, tick, onClose, onChanged }: { id: string | null; tick: number; onClose: () => void; onChanged: () => void }) {
  const { roles } = useAuth();
  const canManage = roles.includes("super_admin") || roles.includes("gestor");
  const [r, setR] = useState<Detail | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelMode, setCancelMode] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!id) { setR(null); return; }
    const sb = requireSupabase();
    sb.from("reservations")
      .select("id,protocol,reservation_date,reservation_time,party_size,origin,status,is_large_group,notes,arrived_at,created_at,customers(full_name,phone_e164,whatsapp_opt_in),units(name)")
      .eq("id", id).maybeSingle()
      .then(({ data }) => setR(data as unknown as Detail));
    sb.rpc("get_reservation_history", { _reservation_id: id }).then(({ data }) => setHist((data ?? []) as Hist[]));
  }, [id, tick]);

  useEffect(() => { setCancelMode(false); setReason(""); setNote(""); }, [id]);

  async function run(key: string, fn: () => PromiseLike<{ error: unknown }>, ok: string) {
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) { toast.error(friendlyError(error)); return false; }
    toast.success(ok);
    onChanged();
    return true;
  }
  const sb = () => requireSupabase();

  const changeStatus = (to: ReservationStatus, n?: string) =>
    run(to, () => sb().rpc("set_reservation_status", { _reservation_id: r!.id, _status: to, _note: n ?? null }), `Status: ${STATUS_LABEL[to]}`);

  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {!r ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <SheetHeader className="text-left">
              <SheetDescription className="font-mono text-xs">{r.protocol}</SheetDescription>
              <SheetTitle className="text-2xl">{r.customers?.full_name ?? "Cliente"}</SheetTitle>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <StatusBadge status={r.status} />
                {r.is_large_group && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-foreground px-2.5 py-1 text-xs font-semibold">
                    <Users className="h-3 w-3" /> Grupo grande
                  </span>
                )}
                {r.arrived_at && <span className="rounded-full bg-surface px-2.5 py-1 text-xs">Chegou às {new Date(r.arrived_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
              </div>
            </SheetHeader>

            <dl className="mt-6 divide-y rounded-2xl bg-surface px-4 text-sm">
              <Item k="Unidade" v={r.units?.name ?? "—"} />
              <Item k="Data" v={<span className="capitalize">{formatDateLong(r.reservation_date)}</span>} />
              <Item k="Horário" v={hhmm(r.reservation_time)} />
              <Item k="Pessoas" v={String(r.party_size)} />
              <Item k="Origem" v={ORIGIN_LABEL[r.origin]} />
              <Item k="WhatsApp" v={r.customers ? formatPhoneE164(r.customers.phone_e164) : "—"} />
              <Item k="Criada em" v={new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} />
            </dl>
            {r.customers && (
              <Button asChild variant="outline" className="mt-3 w-full">
                <a href={waLink(r.customers.phone_e164)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> Abrir no WhatsApp</a>
              </Button>
            )}

            {r.notes && (
              <section className="mt-6">
                <h3 className="text-sm font-medium">Observação do cliente</h3>
                <p className="mt-1 whitespace-pre-wrap rounded-2xl bg-surface p-3 text-sm">{r.notes}</p>
              </section>
            )}

            <section className="mt-6">
              <h3 className="text-sm font-medium">Ações</h3>
              {TRANSITIONS[r.status].length === 0 && <p className="mt-1 text-sm text-muted-foreground">Status final, sem ações disponíveis.</p>}
              {r.is_large_group && r.status === "pendente" && !canManage && (
                <p className="mt-1 text-sm text-muted-foreground">Grupo grande: a confirmação fica com o gestor da unidade.</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {r.status === "confirmada" && !r.arrived_at && (
                  <Button disabled={!!busy} onClick={() => run("arrived", () => sb().rpc("mark_reservation_arrived", { _reservation_id: r.id }), "Chegada registrada")}>
                    {busy === "arrived" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar chegada"}
                  </Button>
                )}
                {TRANSITIONS[r.status].map((to) => {
                  if (to === "confirmada" && !canConfirmLargeGroup(r.is_large_group, canManage)) return null;
                  if (to === "cancelada") return (
                    <Button key={to} variant="outline" disabled={!!busy} onClick={() => setCancelMode(true)}>Cancelar</Button>
                  );
                  return (
                    <Button key={to} variant={to === "confirmada" ? "default" : "outline"} disabled={!!busy} onClick={() => changeStatus(to)}>
                      {busy === to ? <Loader2 className="h-4 w-4 animate-spin" /> : ACTION_LABEL[to]}
                    </Button>
                  );
                })}
              </div>
              {cancelMode && (
                <div className="mt-3 space-y-2 rounded-2xl bg-surface p-3">
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Motivo do cancelamento (obrigatório)" className="rounded-xl bg-background" />
                  <div className="flex gap-2">
                    <Button variant="destructive" disabled={!reason.trim() || !!busy} onClick={async () => { if (await changeStatus("cancelada", reason.trim())) setCancelMode(false); }}>
                      {busy === "cancelada" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar cancelamento"}
                    </Button>
                    <Button variant="ghost" onClick={() => setCancelMode(false)}>Voltar</Button>
                  </div>
                </div>
              )}
            </section>

            <section className="mt-6">
              <h3 className="text-sm font-medium">Observação interna</h3>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ex.: cliente pediu mesa perto da janela" className="mt-2 rounded-xl" />
              <Button variant="outline" className="mt-2" disabled={!note.trim() || !!busy}
                onClick={async () => { if (await run("note", () => sb().rpc("add_reservation_note", { _reservation_id: r.id, _note: note.trim() }), "Observação registrada")) setNote(""); }}>
                Registrar observação
              </Button>
            </section>

            <section className="mt-6 pb-6">
              <h3 className="text-sm font-medium">Histórico</h3>
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
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
