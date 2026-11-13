import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Megaphone, RotateCcw, Send, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, ListSkeleton, NativeSelect, StatCard } from "@/components/admin/bits";
import {
  AUDIENCES, CAMPAIGN_BODY_MAX, CAMPAIGN_STATUS_LABEL, REVIEW_DAYS, SEND_KIND_LABEL, SEND_STATUS_LABEL, TEMPLATE_INFO, TEMPLATE_MAX, TEMPLATE_MIN, VAR_LABEL,
  hasReviewLink, parseAudience, parseOverview, parseSettings, parseTemplates, previewTemplate, reviewHost, reviewUrlProblem, settingsProblem, sinceLabel, unknownVars,
  type AudienceId, type AudiencePreview, type CrmOverview, type CrmSettings, type TemplateKey, type TemplateRow, type VarName,
} from "@/lib/crm";
import { useAuth } from "@/lib/auth";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/crm")({
  head: () => ({ meta: [{ title: "CRM — Candeeiro Gestão" }, { name: "description", content: "Follow-up, reaver clientes e remarketing por WhatsApp." }, { property: "og:title", content: "CRM — Candeeiro Gestão" }, { property: "og:description", content: "Mensagens automáticas e remarketing." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Crm,
});

type Tab = "resumo" | "modelos" | "remarketing" | "avaliacoes" | "envios";
const TABS: { k: Tab; label: string }[] = [
  { k: "resumo", label: "Resumo" }, { k: "modelos", label: "Modelos" }, { k: "remarketing", label: "Remarketing" }, { k: "avaliacoes", label: "Avaliações Google" }, { k: "envios", label: "Envios" },
];
type Unit = { id: string; name: string };

function Crm() {
  const { roles } = useAuth();
  const allowed = roles.includes("super_admin") || roles.includes("gestor");
  const [tab, setTab] = useState<Tab>("resumo");
  const [units, setUnits] = useState<Unit[]>([]);
  useEffect(() => {
    if (!allowed) return;
    void requireSupabase().from("units").select("id,name").order("sort_order").order("name").then(({ data }) => setUnits((data ?? []) as Unit[]));
  }, [allowed]);
  if (!allowed) return <ErrorState message="Só gestores acessam esta área." />;
  return (
    <div className="fade-up">
      <h1 className="text-2xl font-semibold sm:text-4xl">CRM</h1>
      <p className="mt-1 text-sm text-muted-foreground">Mensagens de WhatsApp para trazer o cliente de volta. Só vai para quem autorizou e nunca para quem pediu para sair.</p>
      <div className="seg-scroll mt-5 flex gap-1 overflow-x-auto rounded-full bg-surface p-1" role="tablist">
        {TABS.map(({ k, label }) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("min-h-10 shrink-0 rounded-full px-4 text-sm transition", tab === k ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>{label}</button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "resumo" && <Resumo />}
        {tab === "modelos" && <Modelos />}
        {tab === "remarketing" && <Remarketing units={units} />}
        {tab === "avaliacoes" && <Avaliacoes units={units} />}
        {tab === "envios" && <Envios units={units} />}
      </div>
    </div>
  );
}

/* ───────────────────────── Resumo + automações ───────────────────────── */

function Resumo() {
  const [ov, setOv] = useState<CrmOverview | null>(null);
  const [cfg, setCfg] = useState<CrmSettings | null>(null);
  const [saved, setSaved] = useState<CrmSettings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const sb = requireSupabase();
    const [o, c] = await Promise.all([sb.rpc("crm_overview"), sb.rpc("crm_settings_get")]);
    if (o.error || c.error) { setErr(friendlyError(o.error ?? c.error)); return; }
    const s = parseSettings(c.data);
    setErr(null); setOv(parseOverview(o.data)); setCfg(s); setSaved(s);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (err) return <ErrorState message={err} onRetry={() => void load()} />;
  if (!ov || !cfg || !saved) return <ListSkeleton rows={3} />;

  const set = <K extends keyof CrmSettings>(k: K, v: CrmSettings[K]) => setCfg({ ...cfg, [k]: v });
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  const problem = settingsProblem(cfg);
  const turningOn = (cfg.followup_pos_enabled && !saved.followup_pos_enabled) || (cfg.reaver_inativo_enabled && !saved.reaver_inativo_enabled) || (cfg.reaver_lead_enabled && !saved.reaver_lead_enabled);

  async function save() {
    if (!cfg || problem) return;
    if (turningOn && !window.confirm("Ligar envio automático? A partir de agora, clientes reais passam a receber mensagens no WhatsApp, dentro do horário e do limite por dia configurados.")) return;
    setSaving(true);
    const { error } = await requireSupabase().rpc("crm_settings_save", { _cfg: { ...cfg, public_url: cfg.public_url.trim() } });
    setSaving(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Configuração salva");
    void load();
  }

  const reserved = ov.reserved_after_7d;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Enviadas hoje" value={`${ov.sent_today}/${ov.daily_cap}`} hint="limite por dia" />
        <StatCard label="Na fila" value={ov.pending} hint="aguardando horário" />
        <StatCard label="Enviadas em 7 dias" value={ov.sent_7d} hint={Object.entries(ov.by_kind_7d).map(([k, n]) => `${SEND_KIND_LABEL[k] ?? k}: ${n}`).join(" · ") || undefined} />
        <StatCard label="Reservaram depois" value={reserved} hint="até 7 dias após a mensagem" />
      </div>
      {ov.failed > 0 && <p role="alert" className="rounded-2xl bg-status-cancelled-bg px-4 py-3 text-sm text-status-cancelled">{ov.failed} {ov.failed === 1 ? "mensagem falhou" : "mensagens falharam"} nos últimos 14 dias. Veja na aba Envios.</p>}

      <section className="space-y-1 rounded-3xl bg-card p-5 shadow-soft">
        <h2 className="text-lg font-semibold">Mensagens automáticas</h2>
        <p className="text-sm text-muted-foreground">Desligadas até você ligar. Cada uma usa o modelo da aba Modelos.</p>
        <div className="divide-y">
          <Auto title="Follow-up pós-visita" text="Agradece e pede a opinião de quem compareceu." on={cfg.followup_pos_enabled} onChange={(v) => set("followup_pos_enabled", v)}>
            Enviar <NumberField label="horas" value={cfg.followup_pos_delay_hours} onChange={(n) => set("followup_pos_delay_hours", n)} /> depois da reserva
          </Auto>
          <Auto title="Reaver clientes sumidos" text="Chama de volta quem já veio e não aparece há tempo." on={cfg.reaver_inativo_enabled} onChange={(v) => set("reaver_inativo_enabled", v)}>
            Sumido há mais de <NumberField label="dias" value={cfg.reaver_inativo_days} onChange={(n) => set("reaver_inativo_days", n)} />
          </Auto>
          <Auto title="Reaver leads do WhatsApp" text="Retoma quem chamou no botão do site e não reservou." on={cfg.reaver_lead_enabled} onChange={(v) => set("reaver_lead_enabled", v)}>
            Esperar <NumberField label="horas" value={cfg.reaver_lead_hours} onChange={(n) => set("reaver_lead_hours", n)} /> sem reservar
          </Auto>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl bg-card p-5 shadow-soft">
        <h2 className="text-lg font-semibold">Limites de segurança</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><Label htmlFor="w-start">Enviar a partir das</Label><Input id="w-start" type="time" value={cfg.send_window_start} onChange={(e) => set("send_window_start", e.target.value)} className="mt-1.5 h-12 rounded-xl" /></div>
          <div><Label htmlFor="w-end">Parar às</Label><Input id="w-end" type="time" value={cfg.send_window_end} onChange={(e) => set("send_window_end", e.target.value)} className="mt-1.5 h-12 rounded-xl" /></div>
          <div><Label htmlFor="cap">Máximo por dia</Label><Input id="cap" inputMode="numeric" value={cfg.daily_cap} onChange={(e) => set("daily_cap", Number(e.target.value.replace(/\D/g, "").slice(0, 4)) || 0)} className="mt-1.5 h-12 rounded-xl tabular-nums" /></div>
          <div><Label htmlFor="gap">Dias entre mensagens de marketing</Label><Input id="gap" inputMode="numeric" value={cfg.marketing_gap_days} onChange={(e) => set("marketing_gap_days", Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || 0)} className="mt-1.5 h-12 rounded-xl tabular-nums" /></div>
        </div>
        <div>
          <Label htmlFor="site-url">Endereço do site (para o {"{{link}}"} das mensagens)</Label>
          <Input id="site-url" value={cfg.public_url} onChange={(e) => set("public_url", e.target.value)} placeholder="https://www.seusite.com.br" className="mt-1.5 h-12 rounded-xl" inputMode="url" />
          {!cfg.public_url.trim() && <p className="mt-1 text-xs text-muted-foreground">Sem o endereço, as linhas com {"{{link}}"} saem sem o link.</p>}
        </div>
        <p className="text-xs text-muted-foreground">Toda mensagem de marketing termina com “responda SAIR”. Quem responder SAIR não recebe mais nada. As mensagens só saem se o fluxo “CRM — envios” estiver ativo no n8n.</p>
      </section>

      {problem && dirty && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      <div className="sticky bottom-3 flex justify-end">
        <Button onClick={() => void save()} disabled={saving || !dirty || !!problem} className="h-12 rounded-2xl px-6 shadow-soft">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar configuração"}
        </Button>
      </div>
    </div>
  );
}

function Auto({ title, text, on, onChange, children }: { title: string; text: string; on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
        <p className={cn("mt-2 flex flex-wrap items-center gap-2 text-sm", !on && "opacity-60")}>{children}</p>
      </div>
      <Switch checked={on} onCheckedChange={onChange} aria-label={`${title} ligado`} className="mt-1" />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Input aria-label={label} inputMode="numeric" value={value} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || 0)} className="h-10 w-20 rounded-xl text-center tabular-nums" />
      {label}
    </span>
  );
}

/* ───────────────────────── Modelos ───────────────────────── */

function Modelos() {
  const [rows, setRows] = useState<TemplateRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await requireSupabase().rpc("crm_templates_list");
    if (error) { setErr(friendlyError(error)); return; }
    setErr(null); setRows(parseTemplates(data));
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (err) return <ErrorState message={err} onRetry={() => void load()} />;
  if (!rows) return <ListSkeleton rows={3} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Toque numa variável para encaixar no texto. Se uma variável estiver vazia (ex.: sem motivo), a linha dela some sozinha.</p>
      {rows.map((r) => <TemplateEditor key={r.key + r.body} row={r} onChanged={() => void load()} />)}
    </div>
  );
}

function TemplateEditor({ row, onChanged }: { row: TemplateRow; onChanged: () => void }) {
  const info = TEMPLATE_INFO[row.key];
  const [body, setBody] = useState(row.body);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const bad = unknownVars(row.key, body);
  const len = body.trim().length;
  const invalid = len < TEMPLATE_MIN || len > TEMPLATE_MAX || bad.length > 0;
  const dirty = body.trim() !== row.body.trim();

  function insert(v: VarName) { insertAtCursor(ref.current, body, `{{${v}}}`, setBody); }
  async function save() {
    setBusy(true);
    const { error } = await requireSupabase().rpc("crm_template_save", { _key: row.key, _body: body });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Modelo salvo"); onChanged();
  }
  async function reset() {
    if (!window.confirm("Voltar para o texto padrão?")) return;
    setBusy(true);
    const { error } = await requireSupabase().rpc("crm_template_reset", { _key: row.key });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Texto padrão restaurado"); onChanged();
  }

  return (
    <section className="rounded-3xl bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{info.label}</h2>
        {row.is_custom && <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium">personalizado</span>}
      </div>
      <p className="text-sm text-muted-foreground">{info.when}</p>
      {!info.marketing && !row.is_custom && <p className="mt-1 text-xs text-muted-foreground">Enquanto não personalizar, o atendente automático usa o texto que já tem.</p>}
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <Textarea ref={ref} value={body} onChange={(e) => setBody(e.target.value)} rows={7} maxLength={TEMPLATE_MAX} aria-label={`Texto: ${info.label}`} className="rounded-xl text-base" />
          <VarChips vars={info.vars} onPick={insert} />
          {bad.length > 0 && <p role="alert" className="mt-2 text-sm text-destructive">Variável desconhecida: {bad.map((b) => `{{${b}}}`).join(", ")}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{len}/{TEMPLATE_MAX} caracteres</p>
        </div>
        <Preview text={invalid ? "" : previewTemplate(row.key, body)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void save()} disabled={busy || invalid || !dirty} className="h-11 rounded-xl">{busy ? <Loader2 className="size-4 animate-spin" /> : "Salvar modelo"}</Button>
        {row.is_custom && <Button variant="outline" onClick={() => void reset()} disabled={busy} className="h-11 rounded-xl"><RotateCcw className="size-4" /> Voltar ao padrão</Button>}
      </div>
    </section>
  );
}

function insertAtCursor(el: HTMLTextAreaElement | null, current: string, token: string, set: (v: string) => void) {
  if (!el) { set(current + token); return; }
  const s = el.selectionStart ?? current.length;
  const e = el.selectionEnd ?? s;
  set(current.slice(0, s) + token + current.slice(e));
  requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
}

function VarChips({ vars, onPick }: { vars: readonly VarName[]; onPick: (v: VarName) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Variáveis">
      {vars.map((v) => (
        <button key={v} type="button" onClick={() => onPick(v)} title={VAR_LABEL[v]}
          className="min-h-9 rounded-full border border-input bg-background px-3 text-xs transition hover:bg-surface">{`{{${v}}}`}</button>
      ))}
    </div>
  );
}

function Preview({ text }: { text: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Prévia (dados de exemplo)</p>
      <div className="min-h-32 whitespace-pre-wrap rounded-2xl bg-surface p-4 text-sm leading-relaxed" aria-live="polite">
        {text || <span className="text-muted-foreground">Escreva a mensagem para ver a prévia.</span>}
      </div>
    </div>
  );
}

/* ───────────────────────── Remarketing ───────────────────────── */

type CampaignRow = { id: string; name: string; audience: string; status: string; total: number; created_at: string; unit_id: string | null };
const DEFAULT_RMK = "Oi, {{nome}}! Tem novidade no {{unidade}} 🎉\n{{link}}";

function Remarketing({ units }: { units: Unit[] }) {
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<AudienceId>("inativos");
  const [unit, setUnit] = useState("");
  const [days, setDays] = useState(60);
  const [body, setBody] = useState(DEFAULT_RMK);
  const [aud, setAud] = useState<AudiencePreview | null>(null);
  const [audErr, setAudErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, Record<string, number>>>({});
  const [listErr, setListErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // conta quantas pessoas vão receber, sempre que o público muda
  useEffect(() => {
    let off = false;
    setAud(null); setAudErr(null);
    const t = setTimeout(() => {
      void requireSupabase().rpc("crm_audience_preview", { _audience: audience, _unit: unit || null, _days: days }).then(({ data, error }) => {
        if (off) return;
        if (error) setAudErr(friendlyError(error)); else setAud(parseAudience(data));
      });
    }, 350);
    return () => { off = true; clearTimeout(t); };
  }, [audience, unit, days]);

  const loadList = useCallback(async () => {
    const sb = requireSupabase();
    const [c, s] = await Promise.all([
      sb.from("crm_campaigns").select("id,name,audience,status,total,created_at,unit_id").eq("kind", "remarketing").order("created_at", { ascending: false }).limit(20),
      sb.from("crm_sends").select("campaign_id,status").eq("kind", "remarketing").not("campaign_id", "is", null).order("created_at", { ascending: false }).limit(5000),
    ]);
    if (c.error || s.error) { setListErr(friendlyError(c.error ?? s.error)); return; }
    setListErr(null); setCounts(countByCampaign(s.data)); setCampaigns((c.data ?? []) as CampaignRow[]);
  }, []);
  useEffect(() => { void loadList(); }, [loadList]);

  const bad = unknownVars("remarketing", body);
  const len = body.trim().length;
  const bodyOk = len >= TEMPLATE_MIN && len <= CAMPAIGN_BODY_MAX && bad.length === 0;
  const canSend = bodyOk && name.trim().length >= 2 && !!aud && aud.total > 0 && aud.total <= aud.max;

  async function launch() {
    if (!aud || !canSend) return;
    if (!window.confirm(`Enviar para ${aud.total} ${aud.total === 1 ? "pessoa" : "pessoas"}? As mensagens saem aos poucos, dentro do horário configurado. Você pode cancelar o que ainda estiver na fila.`)) return;
    setSending(true);
    const { data, error } = await requireSupabase().rpc("crm_campaign_launch", { _name: name.trim(), _audience: audience, _unit: unit || null, _days: days, _body: body });
    setSending(false);
    if (error) { toast.error(friendlyError(error)); return; }
    const queued = typeof (data as { queued?: unknown } | null)?.queued === "number" ? (data as { queued: number }).queued : aud.total;
    toast.success(`${queued} ${queued === 1 ? "mensagem entrou" : "mensagens entraram"} na fila`);
    setName(""); void loadList();
  }
  async function cancel(c: CampaignRow) {
    if (!window.confirm(`Cancelar "${c.name}"? O que ainda não foi enviado será descartado.`)) return;
    const { data, error } = await requireSupabase().rpc("crm_campaign_cancel", { _id: c.id });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`${typeof data === "number" ? data : 0} mensagens descartadas`); void loadList();
  }

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-3xl bg-card p-5 shadow-soft">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Megaphone className="size-5" aria-hidden="true" /> Nova campanha de remarketing</h2>
        <div>
          <Label htmlFor="rk-name">Nome da campanha (só para você)</Label>
          <Input id="rk-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Volta às aulas" className="mt-1.5 h-12 rounded-xl" />
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Para quem</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
            {AUDIENCES.map((a) => (
              <button key={a.id} type="button" aria-pressed={audience === a.id} onClick={() => setAudience(a.id)}
                className={cn("rounded-2xl border p-3 text-left transition", audience === a.id ? "border-foreground bg-surface" : "border-input hover:bg-surface")}>
                <span className="block font-medium">{a.label}</span><span className="block text-xs text-muted-foreground">{a.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="rk-unit">Unidade</Label>
            <NativeSelect id="rk-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1.5 h-12 w-full"><option value="">Todas</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></div>
          {audience === "inativos" && <div><Label htmlFor="rk-days">Sumido há mais de (dias)</Label>
            <Input id="rk-days" inputMode="numeric" value={days} onChange={(e) => setDays(Math.min(730, Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || 1))} className="mt-1.5 h-12 rounded-xl tabular-nums" /></div>}
        </div>
        <div className="rounded-2xl bg-surface p-4 text-sm" aria-live="polite">
          {audErr ? <span className="text-destructive">{audErr}</span> : !aud ? <span className="text-muted-foreground">Contando…</span> : aud.total === 0 ? (
            <span>Ninguém se encaixa agora. Só entram clientes que autorizaram WhatsApp, sem reserva futura e sem mensagem de marketing recente.</span>
          ) : (
            <>
              <strong className="text-base">{aud.total} {aud.total === 1 ? "pessoa vai receber" : "pessoas vão receber"}</strong>
              {aud.total > aud.max && <span className="ml-2 text-destructive">máximo de {aud.max} por campanha — escolha uma unidade ou reduza o filtro</span>}
              <span className="mt-1 block text-muted-foreground">Ex.: {aud.sample.map((s) => `${s.nome} (…${s.final})`).join(", ")}</span>
            </>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="rk-body">Mensagem</Label>
            <Textarea id="rk-body" ref={ref} value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={CAMPAIGN_BODY_MAX} className="mt-1.5 rounded-xl text-base" />
            <VarChips vars={TEMPLATE_INFO.remarketing.vars} onPick={(v) => insertAtCursor(ref.current, body, `{{${v}}}`, setBody)} />
            {bad.length > 0 && <p role="alert" className="mt-2 text-sm text-destructive">Variável desconhecida: {bad.map((b) => `{{${b}}}`).join(", ")}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{len}/{CAMPAIGN_BODY_MAX} · o texto “responda SAIR” é adicionado sozinho.</p>
          </div>
          <Preview text={bodyOk ? previewTemplate("remarketing", body) : ""} />
        </div>
        <Button onClick={() => void launch()} disabled={sending || !canSend} className="h-12 rounded-2xl px-6">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <><Send className="size-4" /> Enviar para {aud?.total ?? "…"} {aud?.total === 1 ? "pessoa" : "pessoas"}</>}
        </Button>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Campanhas enviadas</h2>
        {listErr ? <ErrorState message={listErr} onRetry={() => void loadList()} /> : !campaigns ? <ListSkeleton rows={2} /> : campaigns.length === 0 ? (
          <EmptyState title="Nenhuma campanha ainda" text="Escolha o público, escreva a mensagem e envie. O resultado aparece aqui." />
        ) : (
          <ul className="space-y-3">
            {campaigns.map((c) => {
              const k = counts[c.id] ?? {};
              return (
                <li key={c.id} className="rounded-3xl bg-card p-4 shadow-soft">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="text-sm text-muted-foreground">{AUDIENCES.find((a) => a.id === c.audience)?.label ?? c.audience} · {units.find((u) => u.id === c.unit_id)?.name ?? "Todas as unidades"} · {sinceLabel(c.created_at)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-medium">{CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}</span>
                  </div>
                  <p className="mt-2 text-sm tabular-nums">{c.total} no total · {k["enviado"] ?? 0} enviadas · {(k["pendente"] ?? 0) + (k["enviando"] ?? 0)} na fila · {k["falhou"] ?? 0} falharam · {k["cancelado"] ?? 0} canceladas</p>
                  {c.status === "enviando" && <Button variant="outline" onClick={() => void cancel(c)} className="mt-3 h-11 rounded-xl"><X className="size-4" /> Cancelar o que falta</Button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ───────────────────────── Avaliações no Google ───────────────────────── */

type ReviewCampaignRow = CampaignRow & { review_url: string | null; days: number | null };
const DEFAULT_REVIEW = "Oi, {{nome}}! 😊 Foi um prazer receber você no {{unidade}}.\nSe puder, conta pra gente como foi sua experiência avaliando no Google? Leva menos de 1 minuto e ajuda muito:\n{{link_avaliacao}}\nMuito obrigado! 💛";
const REVIEW_LINK_KEY = "crm.reviewUrl.";

function countByCampaign(rows: unknown): Record<string, Record<string, number>> {
  const by: Record<string, Record<string, number>> = {};
  for (const r of (rows ?? []) as { campaign_id: string; status: string }[]) {
    const m = (by[r.campaign_id] ??= {});
    m[r.status] = (m[r.status] ?? 0) + 1;
  }
  return by;
}

// o último link usado em cada unidade fica lembrado só neste navegador (conveniência; o banco guarda o que foi enviado)
function rememberedLink(unit: string): string {
  try { return window.localStorage.getItem(REVIEW_LINK_KEY + unit) ?? ""; } catch { return ""; }
}
function rememberLink(unit: string, url: string) {
  try { window.localStorage.setItem(REVIEW_LINK_KEY + unit, url); } catch { /* sem armazenamento: segue sem lembrar */ }
}

function Avaliacoes({ units }: { units: Unit[] }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [url, setUrl] = useState("");
  const [days, setDays] = useState<number>(REVIEW_DAYS.default);
  const [body, setBody] = useState(DEFAULT_REVIEW);
  const [touchedBody, setTouchedBody] = useState(false);
  const [aud, setAud] = useState<AudiencePreview | null>(null);
  const [audErr, setAudErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [campaigns, setCampaigns] = useState<ReviewCampaignRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, Record<string, number>>>({});
  const [listErr, setListErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // texto inicial = modelo da organização (aba Modelos), enquanto a pessoa não mexeu
  useEffect(() => {
    let off = false;
    void requireSupabase().rpc("crm_templates_list").then(({ data }) => {
      if (off) return;
      const t = parseTemplates(data).find((x) => x.key === "avaliacao_google");
      if (t?.body) setBody((cur) => (touchedBody ? cur : t.body));
    });
    return () => { off = true; };
  }, [touchedBody]);

  function pickUnit(id: string) {
    setUnit(id);
    if (id) setUrl((cur) => (cur.trim() ? cur : rememberedLink(id)));
  }

  // conta quantas pessoas vão receber, sempre que a unidade ou o período muda
  useEffect(() => {
    let off = false;
    setAud(null); setAudErr(null);
    if (!unit) return;
    const t = setTimeout(() => {
      void requireSupabase().rpc("crm_audience_preview", { _audience: "recentes", _unit: unit, _days: days }).then(({ data, error }) => {
        if (off) return;
        if (error) setAudErr(friendlyError(error)); else setAud(parseAudience(data));
      });
    }, 350);
    return () => { off = true; clearTimeout(t); };
  }, [unit, days]);

  const loadList = useCallback(async () => {
    const sb = requireSupabase();
    const [c, s] = await Promise.all([
      sb.from("crm_campaigns").select("id,name,audience,status,total,created_at,unit_id,review_url,days").eq("kind", "avaliacao_google").order("created_at", { ascending: false }).limit(20),
      sb.from("crm_sends").select("campaign_id,status").eq("kind", "avaliacao_google").not("campaign_id", "is", null).order("created_at", { ascending: false }).limit(5000),
    ]);
    if (c.error || s.error) { setListErr(friendlyError(c.error ?? s.error)); return; }
    setListErr(null); setCounts(countByCampaign(s.data)); setCampaigns((c.data ?? []) as ReviewCampaignRow[]);
  }, []);
  useEffect(() => { void loadList(); }, [loadList]);

  const urlProblem = url.trim() ? reviewUrlProblem(url) : null;
  const bad = unknownVars("avaliacao_google", body);
  const len = body.trim().length;
  const bodyOk = len >= TEMPLATE_MIN && len <= CAMPAIGN_BODY_MAX && bad.length === 0 && hasReviewLink(body);
  const linkOk = !!url.trim() && !urlProblem;
  const canSend = bodyOk && linkOk && !!unit && name.trim().length >= 2 && !!aud && aud.total > 0 && aud.total <= aud.max;
  const unitName = units.find((u) => u.id === unit)?.name ?? "";

  async function launch() {
    if (!aud || !canSend) return;
    if (!window.confirm(`Pedir avaliação no Google para ${aud.total} ${aud.total === 1 ? "pessoa" : "pessoas"} do ${unitName}? As mensagens saem aos poucos, dentro do horário configurado. Você pode cancelar o que ainda estiver na fila.`)) return;
    setSending(true);
    const { data, error } = await requireSupabase().rpc("crm_review_campaign_launch", { _name: name.trim(), _unit: unit, _review_url: url.trim(), _body: body, _days: days });
    setSending(false);
    if (error) { toast.error(friendlyError(error)); return; }
    rememberLink(unit, url.trim());
    const queued = typeof (data as { queued?: unknown } | null)?.queued === "number" ? (data as { queued: number }).queued : aud.total;
    toast.success(`${queued} ${queued === 1 ? "pedido entrou" : "pedidos entraram"} na fila`);
    setName(""); void loadList();
  }
  async function cancel(c: ReviewCampaignRow) {
    if (!window.confirm(`Cancelar "${c.name}"? O que ainda não foi enviado será descartado.`)) return;
    const { data, error } = await requireSupabase().rpc("crm_campaign_cancel", { _id: c.id });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`${typeof data === "number" ? data : 0} mensagens descartadas`); void loadList();
  }

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-3xl bg-card p-5 shadow-soft">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Star className="size-5" aria-hidden="true" /> Nova campanha de avaliação no Google</h2>
        <p className="text-sm text-muted-foreground">Convida quem foi atendido há pouco a avaliar a unidade no Google. O link é escolhido aqui, em cada campanha: Goiânia e Anápolis têm páginas diferentes.</p>
        <div>
          <Label htmlFor="av-name">Nome da campanha (só para você)</Label>
          <Input id="av-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Avaliação Anápolis — novembro" className="mt-1.5 h-12 rounded-xl" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="av-unit">Unidade</Label>
            <NativeSelect id="av-unit" value={unit} onChange={(e) => pickUnit(e.target.value)} className="mt-1.5 h-12 w-full"><option value="">Escolha a unidade</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></div>
          <div><Label htmlFor="av-days">Atendidos nos últimos (dias)</Label>
            <Input id="av-days" inputMode="numeric" value={days} onChange={(e) => setDays(Math.min(REVIEW_DAYS.max, Number(e.target.value.replace(/\D/g, "").slice(0, 2)) || REVIEW_DAYS.min))} className="mt-1.5 h-12 rounded-xl tabular-nums" /></div>
        </div>
        <div>
          <Label htmlFor="av-url">Link de avaliação do Google desta unidade</Label>
          <Input id="av-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://g.page/r/…/review" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={!!urlProblem} className="mt-1.5 h-12 rounded-xl" />
          {urlProblem ? <p role="alert" className="mt-1 text-sm text-destructive">{urlProblem}</p> : <p className="mt-1 text-xs text-muted-foreground">No Google Meu Negócio da unidade, use “Pedir avaliações” e copie o link. Aceita g.page, search.google.com, maps.app.goo.gl e share.google.</p>}
          {linkOk && <a href={url.trim()} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-9 items-center gap-1 text-sm underline underline-offset-2"><ExternalLink className="size-3.5" aria-hidden="true" /> Abrir o link para conferir</a>}
        </div>
        <div className="rounded-2xl bg-surface p-4 text-sm" aria-live="polite">
          {!unit ? <span className="text-muted-foreground">Escolha a unidade para ver quantas pessoas vão receber.</span> : audErr ? <span className="text-destructive">{audErr}</span> : !aud ? <span className="text-muted-foreground">Contando…</span> : aud.total === 0 ? (
            <span>Ninguém se encaixa agora. Entram clientes atendidos nesse período, que autorizaram WhatsApp e ainda não receberam pedido de avaliação nos últimos 90 dias.</span>
          ) : (
            <>
              <strong className="text-base">{aud.total} {aud.total === 1 ? "pessoa vai receber" : "pessoas vão receber"}</strong>
              {aud.total > aud.max && <span className="ml-2 text-destructive">máximo de {aud.max} por campanha — reduza o período</span>}
              <span className="mt-1 block text-muted-foreground">Ex.: {aud.sample.map((s) => `${s.nome} (…${s.final})`).join(", ")}</span>
            </>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="av-body">Mensagem</Label>
            <Textarea id="av-body" ref={ref} value={body} onChange={(e) => { setTouchedBody(true); setBody(e.target.value); }} rows={7} maxLength={CAMPAIGN_BODY_MAX} className="mt-1.5 rounded-xl text-base" />
            <VarChips vars={TEMPLATE_INFO.avaliacao_google.vars} onPick={(v) => { setTouchedBody(true); insertAtCursor(ref.current, body, `{{${v}}}`, setBody); }} />
            {bad.length > 0 && <p role="alert" className="mt-2 text-sm text-destructive">Variável desconhecida: {bad.map((b) => `{{${b}}}`).join(", ")}</p>}
            {!hasReviewLink(body) && <p role="alert" className="mt-2 text-sm text-destructive">Inclua {"{{link_avaliacao}}"} no texto: é ali que o link vai.</p>}
            <p className="mt-1 text-xs text-muted-foreground">{len}/{CAMPAIGN_BODY_MAX} · o texto “responda SAIR” é adicionado sozinho.</p>
          </div>
          <Preview text={bodyOk ? previewTemplate("avaliacao_google", body, { ...(linkOk ? { link_avaliacao: url.trim() } : {}), ...(unitName ? { unidade: unitName } : {}) }) : ""} />
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Só recebe quem foi atendido na unidade, autorizou WhatsApp e nunca respondeu SAIR.</li>
          <li>Ninguém recebe mais de um pedido de avaliação a cada 90 dias. Quem tem atendimento do SAC aberto fica de fora até a equipe responder.</li>
          <li>O pedido vai para todos do público, sem separar por satisfação: o Google não permite pedir avaliação só a quem gostou.</li>
        </ul>
        <Button onClick={() => void launch()} disabled={sending || !canSend} className="h-12 rounded-2xl px-6">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <><Send className="size-4" /> Pedir avaliação a {aud?.total ?? "…"} {aud?.total === 1 ? "pessoa" : "pessoas"}</>}
        </Button>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Campanhas de avaliação</h2>
        {listErr ? <ErrorState message={listErr} onRetry={() => void loadList()} /> : !campaigns ? <ListSkeleton rows={2} /> : campaigns.length === 0 ? (
          <EmptyState title="Nenhuma campanha ainda" text="Escolha a unidade, cole o link de avaliação do Google e envie. O andamento aparece aqui." />
        ) : (
          <ul className="space-y-3">
            {campaigns.map((c) => {
              const k = counts[c.id] ?? {};
              return (
                <li key={c.id} className="rounded-3xl bg-card p-4 shadow-soft">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="text-sm text-muted-foreground">{units.find((u) => u.id === c.unit_id)?.name ?? "—"} · atendidos nos últimos {c.days ?? "—"} dias · {sinceLabel(c.created_at)}</p>
                      {c.review_url && <a href={c.review_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex min-h-9 max-w-full items-center gap-1 text-sm underline underline-offset-2"><ExternalLink className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{reviewHost(c.review_url)}</span></a>}
                    </div>
                    <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-medium">{CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}</span>
                  </div>
                  <p className="mt-2 text-sm tabular-nums">{c.total} no total · {k["enviado"] ?? 0} enviadas · {(k["pendente"] ?? 0) + (k["enviando"] ?? 0)} na fila · {k["falhou"] ?? 0} falharam · {k["cancelado"] ?? 0} canceladas</p>
                  {c.status === "enviando" && <Button variant="outline" onClick={() => void cancel(c)} className="mt-3 h-11 rounded-xl"><X className="size-4" /> Cancelar o que falta</Button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ───────────────────────── Envios ───────────────────────── */

type SendRow = { id: string; kind: string; status: string; first_name: string | null; phone_e164: string; unit_id: string | null; text: string; attempts: number; last_error: string | null; scheduled_for: string; sent_at: string | null; created_at: string };
const FILTERS = [["", "Todos"], ["pendente", "Na fila"], ["enviado", "Enviados"], ["falhou", "Falharam"], ["cancelado", "Cancelados"]] as const;
const STATUS_TONE: Record<string, string> = {
  pendente: "bg-status-pending-bg text-status-pending", enviando: "bg-status-pending-bg text-status-pending", enviado: "bg-status-confirmed-bg text-status-confirmed",
  falhou: "bg-status-cancelled-bg text-status-cancelled", cancelado: "bg-surface text-muted-foreground",
};

function Envios({ units }: { units: Unit[] }) {
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<SendRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = requireSupabase().from("crm_sends").select("id,kind,status,first_name,phone_e164,unit_id,text,attempts,last_error,scheduled_for,sent_at,created_at").order("created_at", { ascending: false }).limit(100);
    if (filter) q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) { setErr(friendlyError(error)); return; }
    setErr(null); setRows((data ?? []) as SendRow[]);
  }, [filter]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  async function act(fn: "crm_send_cancel" | "crm_send_retry", id: string, ok: string) {
    const { error } = await requireSupabase().rpc(fn, { _id: id });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(ok); void load();
  }

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Filtrar por status">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={cn("min-h-10 shrink-0 rounded-full border px-4 text-sm transition", filter === k ? "border-foreground bg-surface font-medium" : "border-input text-muted-foreground")}>{label}</button>
        ))}
      </div>
      <div className="mt-4">
        {err ? <ErrorState message={err} onRetry={() => void load()} /> : !rows ? <ListSkeleton /> : rows.length === 0 ? (
          <EmptyState title="Nada por aqui" text="Quando houver follow-up, reaver, remarketing ou pedido de avaliação, cada mensagem aparece nesta lista." />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-3xl bg-card p-4 shadow-soft">
                <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-start gap-3 text-left" aria-expanded={open === r.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.first_name || "Cliente"} <span className="font-normal text-muted-foreground">…{r.phone_e164.slice(-4)}</span></p>
                    <p className="text-sm text-muted-foreground">{SEND_KIND_LABEL[r.kind] ?? r.kind} · {units.find((u) => u.id === r.unit_id)?.name ?? "—"} · {r.status === "enviado" ? sinceLabel(r.sent_at) : sinceLabel(r.created_at)}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_TONE[r.status] ?? "bg-surface")}>{SEND_STATUS_LABEL[r.status] ?? r.status}</span>
                </button>
                {r.last_error && <p className="mt-1 text-sm text-status-cancelled">{r.last_error}{r.attempts > 0 ? ` (tentativa ${r.attempts})` : ""}</p>}
                {open === r.id && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-surface p-3 text-sm">{r.text}</p>}
                {(r.status === "pendente" || r.status === "falhou") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.status === "falhou" && <Button variant="outline" className="h-11 rounded-xl" onClick={() => void act("crm_send_retry", r.id, "De volta para a fila")}><RotateCcw className="size-4" /> Tentar de novo</Button>}
                    <Button variant="outline" className="h-11 rounded-xl" onClick={() => void act("crm_send_cancel", r.id, "Envio cancelado")}><X className="size-4" /> Cancelar</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
