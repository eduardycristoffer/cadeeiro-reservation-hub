import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft, Beef, Briefcase, Cake, CalendarDays, Clock3, Heart, Loader2, MapPin, Minus, PartyPopper, Pizza, Plus, ShieldCheck,
  Users, Utensils, type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { ptBR } from "react-day-picker/locale";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip, Eyebrow, Field, Loading, StepTitle } from "@/components/reserva/ui";
import { friendlyError, isSupabaseConfigured, supabase } from "@/lib/supabase";
import { formatDateLong, fromIsoDate, hhmm, isValidBrPhone, maskBrPhone, toIsoDate } from "@/lib/format";
import {
  MAX_PEOPLE, NOTE_MAX, QUICK_PEOPLE, WHO_MAX, isValidFullName, parsePeople, pessoas, quickLabel, upcomingDays,
  unitsForService,
} from "@/lib/reserva";
import { OCCASIONS, SERVICES, SERVICE_LABEL, type OccasionId, type ServiceId } from "@/lib/reservations";
import { cn } from "@/lib/utils";

type Stage = "capa" | "contatos" | "unidade" | "pessoas" | "quando" | "ocasiao";
type Unit = {
  id: string; name: string; address: string | null; city: string | null; description: string | null;
  photo_url: string | null; large_group_threshold: number; max_advance_days: number; services: string[] | null;
};
type Slot = { slot_time: string; remaining: number; available: boolean };

const SERVICE_ICON: Record<ServiceId, LucideIcon> = { rodizio_carnes: Beef, rodizio_pizza: Pizza };
const OCCASION_ICON: Record<OccasionId, LucideIcon> = {
  aniversario: Cake, romantico: Heart, comemoracao: PartyPopper, negocios: Briefcase, familia: Users, nenhuma: Utensils,
};
const STRIP_DAYS = 14;

export function ReservaFlow({ initialService, campaign }: { initialService?: ServiceId | undefined; campaign?: string | undefined }) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("capa");
  const [pickedService, setPickedService] = useState<ServiceId | null>(null);
  const service: ServiceId | null = initialService ?? pickedService;

  const [units, setUnits] = useState<Unit[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [optIn, setOptIn] = useState(true);
  const [website, setWebsite] = useState("");
  const [touched, setTouched] = useState(false);

  const [peopleRaw, setPeopleRaw] = useState("2");
  const people = parsePeople(peopleRaw);

  const [date, setDate] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [availableDates, setAvailableDates] = useState<Set<string> | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);

  const [occasion, setOccasion] = useState<OccasionId | null>(null);
  const [who, setWho] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const days = useMemo(() => upcomingDays(new Date(), STRIP_DAYS), []);
  // só as unidades que oferecem o rodízio escolhido (cada unidade tem seus serviços)
  const offered = useMemo(() => unitsForService(units ?? [], service), [units, service]);
  const multiUnit = !units || offered.length !== 1;
  const flow: Stage[] = multiUnit ? ["contatos", "unidade", "pessoas", "quando", "ocasiao"] : ["contatos", "pessoas", "quando", "ocasiao"];

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("public_list_units").then(({ data, error }) => {
      if (error) { setLoadError(friendlyError(error)); return; }
      setUnits((data ?? []) as Unit[]);
    });
  }, []);

  useEffect(() => {
    if (!units) return;
    if (offered.length === 1) setUnit(offered[0]!);
    else setUnit((cur) => (cur && offered.some((u) => u.id === cur.id) ? cur : null));
  }, [units, offered]);

  // mudou a quantidade: dia e horário escolhidos antes deixam de valer
  useEffect(() => { setDate(null); setTime(null); setSlots(null); }, [people]);

  useEffect(() => {
    if (stage !== "quando" || !supabase || !unit) return;
    let cancelled = false;
    setAvailableDates(null);
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + Math.min(unit.max_advance_days, 90));
    supabase
      .rpc("get_unit_available_dates", { _unit_id: unit.id, _from: toIsoDate(from), _to: toIsoDate(to), _party_size: Math.max(people, 1) })
      .then(({ data }) => {
        if (!cancelled) setAvailableDates(new Set(((data ?? []) as { available_date: string }[]).map((r) => r.available_date)));
      });
    return () => { cancelled = true; };
  }, [stage, unit, people, reloadKey]);

  useEffect(() => {
    if (stage !== "quando" || !supabase || !unit || !date) return;
    let cancelled = false;
    setSlots(null);
    supabase
      .rpc("get_unit_slots", { _unit_id: unit.id, _date: date, _party_size: Math.max(people, 1) })
      .then(({ data }) => { if (!cancelled) setSlots((data ?? []) as Slot[]); });
    return () => { cancelled = true; };
  }, [stage, unit, date, people, reloadKey]);

  const nameOk = isValidFullName(name);
  const phoneOk = isValidBrPhone(phone);
  const occ = OCCASIONS.find((o) => o.id === occasion);

  const idx = flow.indexOf(stage);
  const next = () => { const n = flow[idx + 1]; if (n) setStage(n); };
  const back = () => { const p = flow[idx - 1]; setStage(p ?? "capa"); };

  function continueFromContacts() {
    setTouched(true);
    if (!nameOk || !phoneOk || !privacy) return;
    // guarda o contato já no início (melhor esforço: não bloqueia o fluxo)
    // (o builder do supabase-js só dispara a requisição quando recebe .then)
    supabase
      ?.rpc("capture_reservation_lead", {
        _full_name: name.trim(),
        _phone: phone,
        _service: service,
        _campaign: campaign ?? null,
        _privacy_accepted: privacy,
        _whatsapp_opt_in: optIn,
        _website: website,
      })
      .then(
        () => undefined,
        () => undefined,
      );
    next();
  }

  async function submit() {
    if (!supabase || !unit || !date || !time || !occasion) return;
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
      _service: service,
      _occasion: occasion,
      _celebrant_name: occ?.asksWho ? who.trim() || null : null,
      _campaign: campaign ?? null,
    });
    setSubmitting(false);
    if (error) {
      const msg = friendlyError(error);
      if (msg.includes("horário")) {
        setTime(null);
        setSlotNotice("Esse horário acabou de ser preenchido por outra reserva. Atualizamos a lista: escolha outro horário.");
        setReloadKey((k) => k + 1);
        setStage("quando");
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
      search: {
        p: r.protocol, u: r.unit_name, d: r.reservation_date, t: r.reservation_time, n: r.party_size, s: r.status,
        r: service ?? "", o: occasion, w: occ?.asksWho ? who.trim() : "",
      },
    });
  }

  // ---------------------------------------------------------------- capa
  if (stage === "capa") {
    return (
      <Shell>
        <div className="flex items-center justify-end pt-5">
          <a href="/entrar" className="text-sm text-muted-foreground hover:text-foreground">Área da equipe</a>
        </div>
        <div className="flex flex-1 flex-col justify-center py-6">
          <div className="fade-up">
            <BrandLogo className="h-28" />
            <h1 className="mt-8 text-5xl font-extrabold leading-[1.02] tracking-tight md:text-6xl">Reservar mesa</h1>
            <p className="mt-3 text-lg text-muted-foreground">
              {initialService ? "Sua mesa em poucos toques." : "Qual rodízio você quer?"}
            </p>
          </div>

          <div className="fade-up mt-8 flex flex-col gap-3">
            {(initialService ? SERVICES.filter((s) => s.id === initialService) : SERVICES).map((s) => {
              const Icon = SERVICE_ICON[s.id];
              const on = service === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={Boolean(initialService)}
                  aria-pressed={on}
                  onClick={() => setPickedService(s.id)}
                  className={cn(
                    "flex h-28 w-full items-center gap-5 rounded-3xl px-6 text-left transition-colors disabled:cursor-default",
                    on || initialService ? "tile-on" : "tile",
                  )}
                >
                  <Icon className={cn("h-9 w-9 shrink-0", on || initialService ? "text-brand-ink" : "text-muted-foreground")} aria-hidden="true" />
                  <span className="text-2xl font-bold tracking-tight">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Footer>
          {!isSupabaseConfigured ? (
            <p className="rounded-2xl bg-surface p-4 text-center text-sm text-muted-foreground">
              O sistema de reservas está sendo configurado. Volte em instantes.
            </p>
          ) : (
            <>
              {!service && <p className="mb-3 text-center text-sm text-muted-foreground">Escolha o rodízio para continuar</p>}
              <Button variant="brand" className="h-16 w-full flex-col gap-0 text-base font-bold" disabled={!service} onClick={() => setStage("contatos")}>
                <span>Reservar agora</span>
                <span className="text-xs font-medium">em 1 minuto</span>
              </Button>
              <p className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Disponibilidade em tempo real</span>
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Dados protegidos (LGPD)</span>
              </p>
            </>
          )}
        </Footer>
      </Shell>
    );
  }

  // ---------------------------------------------------------------- passos
  const dateShort = date ? fromIsoDate(date).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "") : "";
  const summary =
    stage === "quando" ? pessoas(people)
    : stage === "ocasiao" && date && time ? `${pessoas(people)} · ${dateShort} · ${hhmm(time)}`
    : "";

  return (
    <Shell>
      <header className="flex items-center justify-between pt-3">
        <button onClick={back} aria-label="Voltar" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <BrandLogo className="h-10" />
        <span className="w-11" aria-hidden="true" />
      </header>

      <div className="mt-3" role="progressbar" aria-valuemin={1} aria-valuemax={flow.length} aria-valuenow={idx + 1} aria-label="Progresso da reserva">
        <div className="flex gap-1.5">
          {flow.map((s, i) => (
            <div key={s} className={cn("h-1 flex-1 rounded-full transition-colors duration-300", i <= idx ? "bg-brand" : "bg-secondary")} />
          ))}
        </div>
        <p className="mt-2.5 text-sm font-medium text-muted-foreground">Passo {idx + 1} de {flow.length}</p>
      </div>

      <div className="flex-1 pb-6 pt-5">
        {/* contatos primeiro: o lead fica guardado mesmo que a pessoa desista */}
        {stage === "contatos" && (
          <div>
            <StepTitle title="Seus contatos" sub="Para a equipe falar com você sobre a reserva." />
            {service && <Chip className="mt-5">{SERVICE_LABEL[service]}</Chip>}
            <div className="mt-6 space-y-4">
              <Field label="Nome e sobrenome" error={touched && !nameOk ? "Informe nome e sobrenome." : null}>
                <Input value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} className="h-14 rounded-2xl border-0 bg-surface text-base" placeholder="Como você se chama?" />
              </Field>
              <Field label="WhatsApp" error={touched && !phoneOk ? "Informe DDD + número, ex.: (11) 98765-4321." : null}>
                <Input value={phone} inputMode="tel" autoComplete="tel-national" onChange={(e) => setPhone(maskBrPhone(e.target.value))} className="h-14 rounded-2xl border-0 bg-surface text-base tabular-nums" placeholder="(11) 90000-0000" />
              </Field>
              {/* honeypot anti-spam */}
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden name="website" />
              <div className="space-y-3 pt-1 text-sm">
                <label className="flex items-start gap-3">
                  <Checkbox checked={privacy} onCheckedChange={(v) => setPrivacy(v === true)} className="mt-0.5 h-5 w-5" />
                  <span>
                    Li e aceito o aviso de privacidade: usamos nome e WhatsApp para gerenciar esta reserva e o atendimento, conforme a LGPD.
                  </span>
                </label>
                {touched && !privacy && <p className="text-destructive">É preciso aceitar o aviso de privacidade.</p>}
                <label className="flex items-start gap-3">
                  <Checkbox checked={optIn} onCheckedChange={(v) => setOptIn(v === true)} className="mt-0.5 h-5 w-5" />
                  <span>Quero receber a confirmação e atualizações pelo WhatsApp.</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {stage === "unidade" && (
          <div>
            <StepTitle title="Qual unidade?" />
            <div className="mt-6 grid gap-3">
              {loadError && <p className="text-destructive">{loadError}</p>}
              {!units && !loadError && <Loading />}
              {units && offered.length === 0 && <p className="text-muted-foreground">Nenhuma unidade disponível para reservas online deste rodízio no momento.</p>}
              {offered.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setUnit(u); setDate(null); setTime(null); next(); }}
                  className={cn("flex items-center gap-4 rounded-3xl p-4 text-left", unit?.id === u.id ? "tile-on" : "tile")}
                >
                  {u.photo_url ? (
                    <img src={u.photo_url} alt="" className="h-16 w-16 rounded-2xl object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-xl font-semibold text-foreground">{u.name[0]}</div>
                  )}
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{u.name}</p>
                    {(u.address || u.city) && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-sm opacity-70">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> {[u.address, u.city].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "pessoas" && (
          <div>
            <StepTitle title="Quantas pessoas?" sub="Use os botões ou toque no número para digitar." />
            <div className="mt-10 flex items-center justify-between">
              <button
                aria-label="Menos uma pessoa"
                disabled={people <= 1}
                onClick={() => setPeopleRaw(String(Math.max(1, people - 1)))}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-surface transition-transform active:scale-95 disabled:opacity-35"
              >
                <Minus className="h-6 w-6" />
              </button>
              <div className="text-center">
                <input
                  value={peopleRaw}
                  inputMode="numeric"
                  maxLength={3}
                  aria-label="Quantidade de pessoas"
                  placeholder="0"
                  autoComplete="off"
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setPeopleRaw(digits === "" ? "" : String(parsePeople(digits)));
                  }}
                  className="w-44 bg-transparent text-center text-8xl font-extrabold tabular-nums tracking-tighter outline-none placeholder:text-muted-foreground focus-visible:underline focus-visible:decoration-brand focus-visible:decoration-4 focus-visible:underline-offset-8"
                />
                <p className="mt-1 text-lg font-medium text-muted-foreground">{people === 1 ? "pessoa" : "pessoas"}</p>
              </div>
              <button
                aria-label="Mais uma pessoa"
                disabled={people >= MAX_PEOPLE}
                onClick={() => setPeopleRaw(String(Math.min(MAX_PEOPLE, people + 1)))}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-brand-foreground transition-transform active:scale-95 disabled:opacity-35"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>
            <div className="mt-9 flex flex-wrap justify-center gap-2">
              {QUICK_PEOPLE.map((n) => (
                <button
                  key={n}
                  aria-pressed={people === n}
                  onClick={() => setPeopleRaw(String(n))}
                  className={cn("h-11 min-w-14 rounded-full px-4 text-base font-semibold", people === n ? "tile-on" : "bg-surface")}
                >
                  {quickLabel(n)}
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "quando" && (
          <div>
            <StepTitle title="Quando?" sub="Escolha o dia e o horário." />
            <div className="mt-6 flex items-center justify-between gap-3">
              <Eyebrow>Hoje e próximos dias</Eyebrow>
              <button
                aria-expanded={calOpen}
                onClick={() => setCalOpen((o) => !o)}
                className={cn("inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold", calOpen ? "tile-on" : "bg-surface")}
              >
                <CalendarDays className="h-4 w-4" /> Calendário
              </button>
            </div>

            {!availableDates ? <Loading /> : availableDates.size === 0 ? (
              <p className="mt-4 rounded-2xl bg-surface p-4 text-sm text-muted-foreground">
                Não há datas disponíveis para {pessoas(people)} neste momento. Tente outra quantidade de pessoas.
              </p>
            ) : (
              <>
                <div className="no-scrollbar -mx-6 mt-3 flex gap-2 overflow-x-auto px-6">
                  {days.map((d, i) => {
                    const iso = toIsoDate(d);
                    const on = date === iso;
                    const off = !availableDates.has(iso);
                    return (
                      <button
                        key={iso}
                        disabled={off}
                        aria-pressed={on}
                        aria-label={formatDateLong(iso)}
                        onClick={() => { setDate(iso); setTime(null); setCalOpen(false); setSlotNotice(null); }}
                        className={cn(
                          "flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl transition-colors disabled:opacity-30",
                          on ? "tile-on" : "bg-surface",
                        )}
                      >
                        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
                          {i === 0 ? "hoje" : d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                        </span>
                        <span className="text-2xl font-bold tabular-nums tracking-tight">{d.getDate()}</span>
                        <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-brand" : "bg-transparent")} />
                      </button>
                    );
                  })}
                </div>

                {calOpen && (
                  <div className="fade-up mt-3 flex justify-center rounded-3xl bg-surface py-2">
                    <Calendar
                      mode="single"
                      locale={ptBR}
                      className="bg-transparent [--cell-size:2.6rem]"
                      selected={date ? fromIsoDate(date) : undefined}
                      onSelect={(d) => { if (d) { setDate(toIsoDate(d)); setTime(null); setCalOpen(false); setSlotNotice(null); } }}
                      disabled={(d) => !availableDates.has(toIsoDate(d))}
                      fromDate={new Date()}
                      toDate={new Date(Date.now() + Math.min(unit?.max_advance_days ?? 90, 90) * 86400000)}
                    />
                  </div>
                )}
              </>
            )}

            <Eyebrow className="mt-8">{date ? `Horário · ${dateShort}` : "Horário"}</Eyebrow>
            {slotNotice && <p role="status" className="mt-3 rounded-2xl bg-surface p-3 text-sm">{slotNotice}</p>}
            {!date ? (
              <p className="mt-3 text-sm text-muted-foreground">Escolha um dia para ver os horários disponíveis.</p>
            ) : !slots ? <Loading /> : slots.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Os horários deste dia acabaram de esgotar. Escolha outra data.</p>
            ) : (
              <>
                <div className="fade-up mt-3 grid grid-cols-3 gap-2.5">
                  {slots.map((s) => {
                    const on = time === s.slot_time;
                    return (
                      <button
                        key={s.slot_time}
                        disabled={!s.available}
                        aria-pressed={on}
                        onClick={() => { setSlotNotice(null); setTime(s.slot_time); }}
                        className={cn(
                          "h-12 rounded-2xl text-base font-semibold tabular-nums transition-colors disabled:line-through disabled:opacity-35",
                          on ? "bg-brand text-brand-foreground" : "bg-surface",
                        )}
                      >
                        {hhmm(s.slot_time)}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Horários riscados estão lotados para {pessoas(people)}.</p>
              </>
            )}
          </div>
        )}

        {stage === "ocasiao" && (
          <div>
            <StepTitle title="É uma ocasião especial?" sub="Assim a equipe se prepara para receber você." />
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              {OCCASIONS.map((o) => {
                const Icon = OCCASION_ICON[o.id];
                const on = occasion === o.id;
                return (
                  <button
                    key={o.id}
                    aria-pressed={on}
                    onClick={() => setOccasion(o.id)}
                    className={cn("flex h-24 flex-col items-start justify-center gap-2 rounded-3xl px-4 text-left transition-colors", on ? "tile-on" : "bg-surface")}
                  >
                    <Icon className={cn("h-6 w-6", on ? "text-brand-ink" : "text-muted-foreground")} aria-hidden="true" />
                    <span className="text-base font-semibold tracking-tight">{o.label}</span>
                  </button>
                );
              })}
            </div>

            {occ?.asksWho && (
              <div className="fade-up mt-5">
                <Field label="Quem está comemorando? (opcional)">
                  <Input value={who} maxLength={WHO_MAX} onChange={(e) => setWho(e.target.value)} className="h-14 rounded-2xl border-0 bg-surface text-base" placeholder="Nome" autoComplete="off" />
                </Field>
              </div>
            )}

            {occasion && (
              <div className="fade-up mt-5">
                <Field label="Quer que a gente prepare algo? (opcional)">
                  <Textarea
                    value={notes}
                    maxLength={NOTE_MAX}
                    rows={3}
                    onChange={(e) => setNotes(e.target.value)}
                    className="rounded-2xl border-0 bg-surface text-base"
                    placeholder="Ex.: surpresa com bolo, alergia, cadeirinha de bebê…"
                  />
                </Field>
                <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>A equipe confirma o que for possível.</span>
                  <span className="tabular-nums">{notes.length}/{NOTE_MAX}</span>
                </div>
              </div>
            )}
            {submitError && <p role="alert" className="mt-5 rounded-2xl bg-surface p-3 text-sm text-destructive">{submitError}</p>}
          </div>
        )}
      </div>

      <Footer>
        {summary && <p className="mb-3 text-center text-sm font-medium text-muted-foreground">{summary}</p>}
        {stage === "contatos" && (
          <Button variant="brand" size="xl" className="h-14 w-full text-base font-bold" onClick={continueFromContacts}>Continuar</Button>
        )}
        {stage === "pessoas" && (
          <Button variant="brand" size="xl" className="h-14 w-full text-base font-bold" disabled={people < 1} onClick={next}>Continuar</Button>
        )}
        {stage === "quando" && (
          <Button variant="brand" size="xl" className="h-14 w-full text-base font-bold" disabled={!date || !time} onClick={next}>Continuar</Button>
        )}
        {stage === "ocasiao" && (
          <>
            <Button variant="brand" size="xl" className="h-14 w-full text-base font-bold" disabled={!occasion || submitting} onClick={submit}>
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Solicitar reserva"}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">A disponibilidade é verificada novamente no envio.</p>
          </>
        )}
        {stage === "unidade" && <p className="pb-2 text-center text-xs text-muted-foreground">Toque na unidade para continuar.</p>}
      </Footer>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6">{children}</main>;
}

function Footer({ children }: { children: ReactNode }) {
  return <footer className="sticky bottom-0 -mx-6 bg-background px-6 pb-6 pt-3">{children}</footer>;
}
