import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/admin/bits";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { hhmm, isValidBrPhone, maskBrPhone, toIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Slot = { slot_time: string; remaining: number; available: boolean };

export function NewReservationDialog({ open, units, onClose, onCreated }: {
  open: boolean; units: { id: string; name: string }[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [unitId, setUnitId] = useState("");
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [people, setPeople] = useState(2);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [origin, setOrigin] = useState<"painel" | "telefone">("telefone");
  const [status, setStatus] = useState<"confirmada" | "pendente">("confirmada");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open && !unitId && units[0]) setUnitId(units[0].id); }, [open, units, unitId]);

  useEffect(() => {
    if (!open || !unitId || !date || people < 1) return;
    setSlots(null); setTime(null);
    requireSupabase().rpc("staff_unit_slots", { _unit_id: unitId, _date: date, _party_size: people })
      .then(({ data, error }) => {
        if (error) { setErr(friendlyError(error)); setSlots([]); return; }
        setSlots(((data ?? []) as Slot[]).filter((s) => s.available));
      });
  }, [open, unitId, date, people]);

  const valid = unitId && date && time && people > 0 && name.trim().length >= 2 && isValidBrPhone(phone);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true); setErr(null);
    const { data, error } = await requireSupabase().rpc("create_staff_reservation", {
      _unit_id: unitId, _date: date, _time: time, _party_size: people, _full_name: name.trim(), _phone: phone,
      _notes: notes.trim() || null, _origin: origin, _status: status,
    });
    setSaving(false);
    if (error) {
      setErr(friendlyError(error));
      if (String(error.message).includes("SLOT_UNAVAILABLE")) setDate((d) => d); // força recarga abaixo
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
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-2xl">Nova reserva</DialogTitle></DialogHeader>
        {units.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma unidade liberada para você.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <L label="Unidade" className="col-span-2">
                <NativeSelect value={unitId} onChange={(e) => setUnitId(e.target.value)} className="w-full">
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </NativeSelect>
              </L>
              <L label="Data"><Input type="date" value={date} min={toIsoDate(new Date())} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-xl" /></L>
              <L label="Pessoas"><Input type="number" min={1} max={200} value={people} onChange={(e) => setPeople(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} className="h-10 rounded-xl" /></L>
            </div>
            <L label="Horário (somente com vaga)">
              {!slots ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem horários com vaga para {people} pessoa(s) nesse dia.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {slots.map((s) => (
                    <button type="button" key={s.slot_time} onClick={() => setTime(s.slot_time)}
                      className={cn("tile py-2 text-sm", time === s.slot_time && "tile-selected")}>
                      {hhmm(s.slot_time)}
                      <span className="block text-[10px] text-muted-foreground">{s.remaining} vagas</span>
                    </button>
                  ))}
                </div>
              )}
            </L>
            <L label="Nome do cliente"><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="h-10 rounded-xl" /></L>
            <L label="WhatsApp"><Input value={phone} inputMode="tel" onChange={(e) => setPhone(maskBrPhone(e.target.value))} placeholder="(11) 98765-4321" className="h-10 rounded-xl" /></L>
            <L label="Observação (opcional)"><Textarea value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className="rounded-xl" /></L>
            <div className="grid grid-cols-2 gap-3">
              <L label="Origem">
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
            {err && <p className="rounded-xl bg-surface p-3 text-sm text-destructive">{err}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={!valid || saving}>
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Criar reserva"}
            </Button>
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
