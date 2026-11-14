import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Minus, Plus, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/admin/bits";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { useScope } from "@/lib/scope-context";
import { preferredUnitId } from "@/lib/scope";
import { formatDateLong } from "@/lib/format";
import { hhmm, isValidBrPhone, maskBrPhone, toIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Slot = { slot_time: string; remaining: number; available: boolean };

const STEPS = ["Quando e quantos", "Quem vai", "Confirmar"] as const;
type Known = { full_name: string; reservations_count: number; last_reservation: string | null };

/** Nova reserva em 3 passos: quando e quantos → quem → confirmar. A unidade já vem escolhida para quem tem uma só. */
export function NewReservationDialog({ open, units, onClose, onCreated }: {
  open: boolean; units: { id: string; name: string }[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const { scope } = useScope();
  const [step, setStep] = useState(0);
  const [unitId, setUnitId] = useState("");
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [people, setPeople] = useState(2);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [known, setKnown] = useState<Known | null>(null);
  const [notes, setNotes] = useState("");
  const [origin, setOrigin] = useState<"painel" | "telefone">("telefone");
  const [status, setStatus] = useState<"confirmada" | "pendente">("confirmada");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep(0); setErr(null); setTime(null); setKnown(null);
    setUnitId(preferredUnitId(units, scope?.defaultUnitId ?? null));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !unitId || !date || people < 1) return;
    let cancelled = false;
    setSlots(null); setTime(null); setErr(null);
    requireSupabase().rpc("staff_unit_slots", { _unit_id: unitId, _date: date, _party_size: people })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setErr(friendlyError(error)); setSlots([]); return; }
        setSlots(((data ?? []) as Slot[]).filter((s) => s.available));
      });
    return () => { cancelled = true; };
  }, [open, unitId, date, people, reload]);

  // telefone completo: procura se a pessoa já é cliente (e já preenche o nome)
  const phoneOk = isValidBrPhone(phone);
  useEffect(() => {
    if (!phoneOk) { setKnown(null); return; }
    let alive = true;
    void requireSupabase().rpc("customers_directory" as never, { _q: phone.replace(/\D/g, "").slice(-8), _unit: null, _limit: 3, _offset: 0 } as never).then(({ data, error }) => {
      if (!alive || error || !Array.isArray(data)) return;
      const digits = phone.replace(/\D/g, "");
      const hit = (data as (Known & { phone_e164: string })[]).find((r) => r.phone_e164.endsWith(digits.slice(-10)));
      setKnown(hit ?? null);
      if (hit) setName((n) => (n.trim().length < 2 ? hit.full_name : n));
    });
    return () => { alive = false; };
  }, [phone, phoneOk]);

  const step1Ok = !!(unitId && date && time && people > 0);
  const step2Ok = name.trim().length >= 2 && phoneOk;
  const unitName = units.find((u) => u.id === unitId)?.name ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 2) { if ((step === 0 && step1Ok) || (step === 1 && step2Ok)) setStep(step + 1); return; }
    if (!step1Ok || !step2Ok) return;
    setSaving(true); setErr(null);
    const { data, error } = await requireSupabase().rpc("create_staff_reservation", {
      _unit_id: unitId, _date: date, _time: time, _party_size: people, _full_name: name.trim(), _phone: phone,
      _notes: notes.trim() || null, _origin: origin, _status: status,
    });
    setSaving(false);
    if (error) {
      setErr(friendlyError(error));
      if (String(error.message).includes("SLOT_UNAVAILABLE")) { setReload((n) => n + 1); setStep(0); }
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { id: string; protocol: string; status: string };
    toast.success(`Reserva ${row.protocol} criada`, { description: row.status === "pendente" ? "Ficou pendente (grupo grande precisa de gestor)." : undefined });
    setName(""); setPhone(""); setNotes(""); setTime(null);
    onClose();
    onCreated(row.id);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl p-4 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl">Nova reserva</DialogTitle>
          <DialogDescription className="sr-only">Preencha em três passos</DialogDescription>
          <ol className="mt-2 flex items-center gap-2" aria-label="Passos">
            {STEPS.map((label, i) => (
              <li key={label} className="flex min-w-0 flex-1 flex-col gap-1" aria-current={i === step ? "step" : undefined}>
                <span className={cn("h-1.5 rounded-full transition-colors", i <= step ? "bg-brand" : "bg-border")} />
                <span className={cn("truncate text-xs", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>{i + 1}. {label}</span>
              </li>
            ))}
          </ol>
        </DialogHeader>
        {units.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma unidade liberada para você.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {step === 0 && (
              <>
                {units.length > 1 ? (
                  <L label="Unidade"><NativeSelect value={unitId} onChange={(e) => setUnitId(e.target.value)} className="h-11 w-full">{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></L>
                ) : <p className="rounded-xl bg-surface px-3 py-2 text-sm"><span className="text-muted-foreground">Unidade: </span><span className="font-medium">{unitName}</span></p>}
                <div className="grid grid-cols-2 gap-3">
                  <L label="Data"><Input type="date" value={date} min={toIsoDate(new Date())} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl" /></L>
                  <L label="Quantas pessoas">
                    <div className="flex h-11 items-center justify-between rounded-xl border bg-background px-1">
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Menos uma pessoa" disabled={people <= 1} onClick={() => setPeople((n) => Math.max(1, n - 1))}><Minus /></Button>
                      <span className="text-base font-semibold tabular-nums" aria-live="polite">{people}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Mais uma pessoa" disabled={people >= 200} onClick={() => setPeople((n) => Math.min(200, n + 1))}><Plus /></Button>
                    </div>
                  </L>
                </div>
                <L label="Horário (só os que têm vaga)">
                  {!slots ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Buscando horários" /> : slots.length === 0 ? (
                    <p className="rounded-xl bg-surface p-3 text-sm text-muted-foreground">Sem horários com vaga para {people} {people === 1 ? "pessoa" : "pessoas"} nesse dia. Tente outra data ou menos pessoas.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((s) => (
                        <button type="button" key={s.slot_time} onClick={() => setTime(s.slot_time)} aria-pressed={time === s.slot_time}
                          className={cn("tile py-2 text-sm", time === s.slot_time && "tile-selected")}>
                          {hhmm(s.slot_time)}
                          <span className="block text-[10px] text-muted-foreground">{s.remaining} vagas</span>
                        </button>
                      ))}
                    </div>
                  )}
                </L>
              </>
            )}
            {step === 1 && (
              <>
                <L label="WhatsApp do cliente"><Input autoFocus value={phone} inputMode="tel" onChange={(e) => setPhone(maskBrPhone(e.target.value))} placeholder="(62) 99999-0000" className="h-12 rounded-xl" /></L>
                {known && (
                  <p className="flex items-start gap-2 rounded-xl bg-surface p-3 text-sm" role="status"><UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-status-confirmed" aria-hidden="true" />
                    <span><span className="font-medium">Cliente já cadastrado:</span> {known.full_name} · {known.reservations_count} {known.reservations_count === 1 ? "reserva" : "reservas"}{known.last_reservation ? `, última em ${formatDateLong(known.last_reservation)}` : ""}.</span></p>
                )}
                <L label="Nome do cliente"><Input value={name} maxLength={120} autoComplete="off" onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl" /></L>
              </>
            )}
            {step === 2 && (
              <>
                <dl className="space-y-1.5 rounded-2xl bg-surface p-4 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Cliente</dt><dd className="min-w-0 truncate font-medium">{name.trim()}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">WhatsApp</dt><dd className="font-medium">{phone}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Quando</dt><dd className="text-right font-medium">{formatDateLong(date)} às {time ? hhmm(time) : ""}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Pessoas · unidade</dt><dd className="text-right font-medium">{people} · {unitName}</dd></div>
                </dl>
                <L label="Observação (opcional)"><Textarea value={notes} maxLength={500} placeholder="Aniversário, cadeirinha, mesa perto da janela…" onChange={(e) => setNotes(e.target.value)} className="rounded-xl" /></L>
                <div className="grid grid-cols-2 gap-3">
                  <L label="Como chegou">
                    <NativeSelect value={origin} onChange={(e) => setOrigin(e.target.value as "painel" | "telefone")} className="w-full">
                      <option value="telefone">Telefone</option>
                      <option value="painel">Balcão / painel</option>
                    </NativeSelect>
                  </L>
                  <L label="Status inicial">
                    <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as "confirmada" | "pendente")} className="w-full">
                      <option value="confirmada">Confirmada</option>
                      <option value="pendente">Pendente</option>
                    </NativeSelect>
                  </L>
                </div>
              </>
            )}
            {err && <p role="alert" className="rounded-xl bg-surface p-3 text-sm text-destructive">{err}</p>}
            <div className="flex gap-2">
              {step > 0 && <Button type="button" variant="outline" size="lg" className="h-12" onClick={() => setStep(step - 1)}><ArrowLeft />Voltar</Button>}
              <Button type="submit" size="lg" className="h-12 flex-1" disabled={saving || (step === 0 && !step1Ok) || (step === 1 && !step2Ok)}>
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : step < 2 ? <>Continuar<ArrowRight /></> : "Criar reserva"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function L({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
