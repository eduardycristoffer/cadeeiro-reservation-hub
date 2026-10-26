import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, MapPin, ShieldCheck, Users, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { friendlyError, isSupabaseConfigured, supabase } from "@/lib/supabase";
import { formatDateLong, fromIsoDate, hhmm, isValidBrPhone, maskBrPhone, toIsoDate } from "@/lib/format";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/reservar/")({
  head: () => ({
    meta: [
      { title: "Reservar mesa — Rede Candeeiro" },
      { name: "description", content: "Escolha a unidade, o dia e o horário. Sua reserva em menos de um minuto." },
      { property: "og:title", content: "Reservar mesa — Rede Candeeiro" },
      { property: "og:description", content: "Sua reserva na Rede Candeeiro em menos de um minuto." },
    ],
  }),
  component: ReservarPage,
});

type Unit = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  description: string | null;
  photo_url: string | null;
  large_group_threshold: number;
  max_advance_days: number;
};
type Slot = { slot_time: string; remaining: number; available: boolean };

const STEPS = ["Unidade", "Dia", "Horário", "Pessoas", "Seus dados", "Revisão"];

function ReservarPage() {
  const formRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const start = () => {
    setStarted(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="text-lg font-semibold tracking-tight">Candeeiro</span>
        <a href="/entrar" className="text-sm text-muted-foreground hover:text-foreground">
          Área da equipe
        </a>
      </header>

      <section className="mx-auto max-w-5xl px-5 pb-10 pt-6 text-center md:pt-14">
        <h1 className="fade-up text-4xl font-semibold leading-[1.05] md:text-6xl">
          Sua mesa,
          <br />
          sem espera.
        </h1>
        <p className="fade-up mx-auto mt-5 max-w-md text-lg text-muted-foreground">
          Escolha a unidade, o dia e o horário. Leva menos de um minuto.
        </p>
        {!started && (
          <Button size="xl" className="fade-up mt-8" onClick={start}>
            Reservar agora
          </Button>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" /> Disponibilidade em tempo real</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Dados protegidos (LGPD)</span>
        </div>
      </section>

      {!started && (
        <div className="mx-auto max-w-5xl px-5 pb-16">
          <img
            src={hero}
            alt="Mesa posta em uma unidade da Rede Candeeiro"
            width={1600}
            height={1008}
            className="aspect-[16/10] w-full rounded-3xl object-cover"
          />
        </div>
      )}

      {started && (
        <div ref={formRef} className="scroll-mt-4 bg-surface px-5 py-10 md:py-16">
          <Wizard />
        </div>
      )}

      <footer className="mx-auto max-w-5xl px-5 py-10 text-center text-xs text-muted-foreground">
        Rede Candeeiro · Desenvolvido por Tryade
      </footer>
    </main>
  );
}

function Wizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<Set<string> | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [people, setPeople] = useState<number>(2);
  const [bigGroup, setBigGroup] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("public_list_units").then(({ data, error }) => {
      if (error) setLoadError(friendlyError(error));
      else setUnits((data ?? []) as Unit[]);
    });
  }, []);

  useEffect(() => {
    if (!supabase || !unit) return;
    setAvailableDates(null);
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + Math.min(unit.max_advance_days, 90));
    supabase
      .rpc("get_unit_available_dates", { _unit_id: unit.id, _from: toIsoDate(from), _to: toIsoDate(to), _party_size: 1 })
      .then(({ data }) => setAvailableDates(new Set(((data ?? []) as { available_date: string }[]).map((r) => r.available_date))));
  }, [unit, reloadKey]);

  useEffect(() => {
    if (!supabase || !unit || !date) return;
    setSlots(null);
    supabase
      .rpc("get_unit_slots", { _unit_id: unit.id, _date: date, _party_size: 1 })
      .then(({ data }) => setSlots(((data ?? []) as Slot[]).filter((s) => s.remaining > 0)));
  }, [unit, date, reloadKey]);

  const remainingAtTime = useMemo(() => slots?.find((s) => s.slot_time === time)?.remaining ?? 0, [slots, time]);
  const threshold = Math.max(1, unit?.large_group_threshold ?? 10);
  const nameOk = name.trim().length >= 3 && /\s/.test(name.trim());
  const phoneOk = isValidBrPhone(phone);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  async function submit() {
    if (!supabase || !unit || !date || !time) return;
    setSubmitting(true);
    setSubmitError(null);
    const { data, error } = await supabase.rpc("create_public_reservation", {
      _unit_id: unit.id,
      _date: date,
      _time: time,
      _party_size: people,
      _full_name: name.trim(),
      _phone: phone,
      _notes: notes.trim() || null,
      _privacy_accepted: privacy,
      _whatsapp_opt_in: optIn,
      _website: website,
    });
    setSubmitting(false);
    if (error) {
      const msg = friendlyError(error);
      if (msg.includes("horário")) {
        setSubmitError(null);
        setTime(null);
        setSlotNotice("Esse horário acabou de ser preenchido por outra reserva. Atualizamos a lista: escolha outro horário.");
        setReloadKey((k) => k + 1);
        setStep(2);
      } else {
        setSubmitError(msg);
      }
      return;
    }
    const r = (Array.isArray(data) ? data[0] : data) as {
      protocol: string; status: string; unit_name: string; reservation_date: string; reservation_time: string; party_size: number;
    };
    navigate({
      to: "/reservar/sucesso",
      search: { p: r.protocol, u: r.unit_name, d: r.reservation_date, t: r.reservation_time, n: r.party_size, s: r.status },
    });
  }

  if (!isSupabaseConfigured) {
    return (
      <Card>
        <h2 className="text-2xl font-semibold">Reservas online em breve</h2>
        <p className="mt-2 text-muted-foreground">O sistema de reservas está sendo configurado. Volte em instantes.</p>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Etapa {step + 1} de {STEPS.length}</span>
          <span>{STEPS[step]}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <Card key={step}>
        {step > 0 && (
          <button onClick={back} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        )}

        {step === 0 && (
          <>
            <Title>Em qual unidade deseja reservar?</Title>
            {loadError && <p className="text-destructive">{loadError}</p>}
            {!units && !loadError && <Loading />}
            {units?.length === 0 && <p className="text-muted-foreground">Nenhuma unidade disponível para reservas online no momento.</p>}
            <div className="grid gap-3">
              {units?.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setUnit(u); setDate(null); setTime(null); next(); }}
                  className={cn("tile flex items-center gap-4 p-4 text-left", unit?.id === u.id && "tile-selected")}
                >
                  {u.photo_url ? (
                    <img src={u.photo_url} alt="" className="h-16 w-16 rounded-xl object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-surface text-xl font-semibold">{u.name[0]}</div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold">{u.name}</p>
                    {(u.address || u.city) && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> {[u.address, u.city].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && unit && (
          <>
            <Title>Para qual dia deseja sua reserva?</Title>
            {!availableDates ? <Loading /> : availableDates.size === 0 ? (
              <p className="text-muted-foreground">Não há datas disponíveis nesta unidade no momento.</p>
            ) : (
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={date ? fromIsoDate(date) : undefined}
                  onSelect={(d) => { if (d) { setDate(toIsoDate(d)); setTime(null); next(); } }}
                  disabled={(d) => !availableDates.has(toIsoDate(d))}
                  fromDate={new Date()}
                />
              </div>
            )}
          </>
        )}

        {step === 2 && date && (
          <>
            <Title>Qual horário deseja?</Title>
            <p className="-mt-3 mb-5 text-sm capitalize text-muted-foreground">{formatDateLong(date)}</p>
            {slotNotice && <p role="status" className="mb-4 rounded-xl bg-surface p-3 text-sm">{slotNotice}</p>}
            {!slots ? <Loading /> : slots.length === 0 ? (
              <p className="text-muted-foreground">Os horários deste dia acabaram de esgotar. Escolha outra data.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => (
                  <button
                    key={s.slot_time}
                    onClick={() => { setSlotNotice(null); setTime(s.slot_time); if (people > s.remaining) setPeople(Math.min(2, s.remaining)); next(); }}
                    className={cn("tile py-3 text-center font-medium", time === s.slot_time && "tile-selected")}
                  >
                    {hhmm(s.slot_time)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <Title>Para quantas pessoas?</Title>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: threshold }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  disabled={n > remainingAtTime}
                  onClick={() => { setPeople(n); setBigGroup(false); next(); }}
                  className={cn("tile aspect-square text-lg font-medium disabled:cursor-not-allowed disabled:opacity-30", !bigGroup && people === n && "tile-selected")}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setBigGroup(true); setPeople(threshold + 1); }}
              className={cn("tile mt-3 flex w-full items-center justify-center gap-2 py-3 text-sm font-medium", bigGroup && "tile-selected")}
            >
              <Users className="h-4 w-4" /> Grupo com mais de {threshold} pessoas
            </button>
            {bigGroup && (
              <div className="mt-4 space-y-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={threshold + 1}
                  max={200}
                  value={people}
                  onChange={(e) => setPeople(Math.max(1, Math.min(200, Number(e.target.value) || 0)))}
                  className="h-12 rounded-xl text-lg"
                  aria-label="Quantidade de pessoas"
                />
                {people > remainingAtTime && (
                  <p className="text-sm text-destructive">Este horário comporta no máximo {remainingAtTime} pessoas. Escolha outro horário.</p>
                )}
                <p className="text-sm text-muted-foreground">Grupos grandes sempre passam por confirmação da unidade.</p>
                <Button className="w-full" size="lg" disabled={people <= threshold || people > remainingAtTime} onClick={next}>Continuar</Button>
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <Title>Como podemos identificar sua reserva?</Title>
            <div className="space-y-4">
              <Field label="Nome completo" error={touched && !nameOk ? "Informe nome e sobrenome." : null}>
                <Input value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl" placeholder="Maria Silva" />
              </Field>
              <Field label="WhatsApp" error={touched && !phoneOk ? "Informe DDD + número, ex.: (11) 98765-4321." : null}>
                <Input value={phone} inputMode="tel" autoComplete="tel-national" onChange={(e) => setPhone(maskBrPhone(e.target.value))} className="h-12 rounded-xl" placeholder="(11) 98765-4321" />
              </Field>
              <Field label="Observação (opcional)">
                <Textarea value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className="rounded-xl" placeholder="Aniversário, cadeirinha para criança…" />
              </Field>
              {/* honeypot anti-spam */}
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden name="website" />
              <Button className="w-full" size="lg" onClick={() => { setTouched(true); if (nameOk && phoneOk) next(); }}>Continuar</Button>
            </div>
          </>
        )}

        {step === 5 && unit && date && time && (
          <>
            <Title>Revise sua solicitação</Title>
            <dl className="divide-y rounded-2xl bg-surface px-5">
              <Summary k="Unidade" v={unit.name} onEdit={() => setStep(0)} />
              <Summary k="Data" v={formatDateLong(date)} onEdit={() => setStep(1)} />
              <Summary k="Horário" v={hhmm(time)} onEdit={() => setStep(2)} />
              <Summary k="Pessoas" v={String(people)} onEdit={() => setStep(3)} />
              <Summary k="Nome" v={name.trim()} onEdit={() => setStep(4)} />
              <Summary k="WhatsApp" v={phone} onEdit={() => setStep(4)} />
            </dl>
            <div className="mt-5 space-y-3 text-sm">
              <label className="flex items-start gap-3">
                <Checkbox checked={privacy} onCheckedChange={(v) => setPrivacy(v === true)} className="mt-0.5" />
                <span>
                  Li e aceito o aviso de privacidade: usamos nome e WhatsApp somente para gerenciar esta reserva e o atendimento, conforme a LGPD.
                </span>
              </label>
              <label className="flex items-start gap-3">
                <Checkbox checked={optIn} onCheckedChange={(v) => setOptIn(v === true)} className="mt-0.5" />
                <span>Quero receber atualizações desta reserva pelo WhatsApp.</span>
              </label>
            </div>
            {submitError && <p className="mt-4 rounded-xl bg-surface p-3 text-sm text-destructive">{submitError}</p>}
            <Button className="mt-6 w-full" size="xl" disabled={!privacy || submitting} onClick={submit}>
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enviar solicitação"}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              A disponibilidade é verificada novamente no envio.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="fade-up mx-auto max-w-xl rounded-3xl bg-card p-6 shadow-soft md:p-8">{children}</div>;
}
function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-6 text-2xl font-semibold md:text-3xl">{children}</h2>;
}
function Loading() {
  return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
}
function Field({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {error && <span className="mt-1.5 block text-sm text-destructive">{error}</span>}
    </label>
  );
}
function Summary({ k, v, onEdit }: { k: string; v: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="flex items-center gap-3 text-right font-medium">
        <span className="first-letter:uppercase">{v}</span>
        <button onClick={onEdit} className="text-xs text-muted-foreground underline-offset-2 hover:underline">Alterar</button>
      </dd>
    </div>
  );
}
