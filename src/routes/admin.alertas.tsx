import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ALERTS_CHANGED } from "@/components/admin/AlertBell";
import { EmptyState, ErrorState, ListSkeleton, StatCard } from "@/components/admin/bits";
import { parseEmailSettings, parseNotifications, groupByDay, settingsPayload, SEVERITY_DOT, type EmailSettings, type Notif } from "@/lib/alerts";
import { useAuth } from "@/lib/auth";
import { sinceLabel } from "@/lib/crm";
import { ALERT_KINDS, SEVERITY_LABEL, type AlertKind } from "@/lib/email";
import { getEmailStatus } from "@/lib/email.functions";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/alertas")({
  head: () => ({ meta: [{ title: "Alertas — Candeeiro Gestão" }, { name: "description", content: "Avisos do painel e e-mails de alerta." }, { property: "og:title", content: "Alertas — Candeeiro Gestão" }, { property: "og:description", content: "Avisos do painel e e-mails de alerta." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Alertas,
});

const notifyChanged = () => window.dispatchEvent(new Event(ALERTS_CHANGED));
/** Erro de "função não existe" = a migração de alertas ainda não foi aplicada neste banco. */
const notReady = (e: { message?: string; code?: string } | null) => !!e && (e.code === "PGRST202" || e.code === "42P01" || /could not find the function|does not exist|schema cache/i.test(e.message ?? ""));
const NOT_READY_MSG = "Os alertas ainda não foram ativados neste ambiente. Peça para aplicar a atualização do banco (migração 015).";

type Tab = "alertas" | "email";

function Alertas() {
  const [tab, setTab] = useState<Tab>("alertas");
  return (
    <div className="fade-up">
      <h1 className="text-2xl font-semibold sm:text-4xl">Alertas</h1>
      <p className="mt-1 text-sm text-muted-foreground">Reserva nova, cancelamento, atendimento no SAC e mensagens que não saíram — no painel e por e-mail.</p>
      <div className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-surface p-1 sm:inline-grid sm:grid-cols-[repeat(2,10rem)]" role="tablist">
        {([["alertas", "Avisos"], ["email", "E-mail"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("min-h-10 rounded-full px-4 text-sm transition", tab === k ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>{label}</button>
        ))}
      </div>
      <div className="mt-5">{tab === "alertas" ? <Lista /> : <Email />}</div>
    </div>
  );
}

function Lista() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Notif[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = requireSupabase();
    setErr(null);
    const [n, r] = await Promise.all([
      sb.from("notifications" as never).select("id,kind,severity,title,body,link,created_at").order("created_at", { ascending: false }).limit(100),
      sb.from("notification_reads" as never).select("notification_id").limit(1000),
    ]);
    if (n.error) { setErr(notReady(n.error) ? NOT_READY_MSG : friendlyError(n.error)); setRows([]); return; }
    const readIds = ((r.data ?? []) as unknown as { notification_id: string }[]).map((x) => x.notification_id);
    setRows(parseNotifications(n.data, readIds));
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function markRead(ids: string[] | null): Promise<boolean> {
    const { error } = await requireSupabase().rpc("notifications_mark_read" as never, { _ids: ids } as never);
    if (error) { toast.error(friendlyError(error)); return false; }
    notifyChanged();
    return true;
  }
  async function open(n: Notif): Promise<void> {
    if (!n.read && (await markRead([n.id]))) setRows((cur) => cur?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? cur);
    if (n.link) void navigate({ to: n.link as "/admin" });
  }
  async function readAll(): Promise<void> {
    setBusy(true);
    const ok = await markRead(null);
    setBusy(false);
    if (ok) { setRows((cur) => cur?.map((x) => ({ ...x, read: true })) ?? cur); toast.success("Tudo marcado como lido"); }
  }

  if (err) return <ErrorState message={err} onRetry={load} />;
  if (!rows) return <ListSkeleton />;
  const unread = rows.filter((x) => !x.read).length;
  const shown = onlyUnread ? rows.filter((x) => !x.read) : rows;
  const groups = groupByDay(shown);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full bg-surface p-1" role="group" aria-label="Filtro">
          {([[false, "Todos"], [true, `Não lidos${unread ? ` (${unread})` : ""}`]] as const).map(([v, label]) => (
            <button key={label} type="button" aria-pressed={onlyUnread === v} onClick={() => setOnlyUnread(v)}
              className={cn("min-h-9 rounded-full px-4 text-sm transition", onlyUnread === v ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>{label}</button>
          ))}
        </div>
        <Button variant="ghost" className="h-10" disabled={busy || unread === 0} onClick={readAll}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCheck className="h-4 w-4" /> Marcar todos como lidos</>}
        </Button>
      </div>
      {groups.length === 0 ? (
        <div className="mt-6"><EmptyState icon={Bell} title={onlyUnread ? "Nada por ler" : "Tudo em dia"} text="Quando chegar uma reserva, cancelamento ou atendimento no SAC, aparece aqui." /></div>
      ) : groups.map((g) => (
        <section key={g.label} className="mt-5">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</h2>
          <ul className="mt-2 space-y-2">
            {g.items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => void open(n)}
                  className={cn("flex min-h-16 w-full items-start gap-3 rounded-2xl p-4 text-left shadow-soft transition active:scale-[0.99]", n.read ? "bg-card" : "bg-card ring-1 ring-brand/30")}>
                  <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", SEVERITY_DOT[n.severity])} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", n.read ? "text-muted-foreground" : "font-semibold")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {n.severity !== "info" && <span className="mr-2 font-medium text-foreground">{SEVERITY_LABEL[n.severity]}</span>}
                      {sinceLabel(n.created_at)}
                    </span>
                  </span>
                  {!n.read && <span className="mt-1 shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-brand-foreground">novo</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type Status = { configured: boolean; missing: string[]; appUrl: boolean };

function Email() {
  const { roles } = useAuth();
  const manager = roles.includes("super_admin") || roles.includes("gestor");
  const [mine, setMine] = useState<boolean | null>(null);
  const [mineErr, setMineErr] = useState<string | null>(null);

  useEffect(() => {
    void requireSupabase().rpc("notification_prefs_get" as never).then(({ data, error }) => {
      if (error) { setMineErr(notReady(error) ? NOT_READY_MSG : friendlyError(error)); return; }
      setMine((data as { email_alerts?: boolean } | null)?.email_alerts !== false);
    });
  }, []);

  async function toggleMine(v: boolean): Promise<void> {
    const prev = mine;
    setMine(v);
    const { error } = await requireSupabase().rpc("notification_prefs_set" as never, { _email_alerts: v } as never);
    if (error) { setMine(prev); toast.error(friendlyError(error)); return; }
    toast.success(v ? "Você vai receber alertas por e-mail" : "Você não vai mais receber alertas por e-mail");
  }

  if (mineErr) return <ErrorState message={mineErr} />;
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-2xl bg-card p-4 shadow-soft">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Receber alertas no meu e-mail</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Só dos assuntos das unidades que você atende. O sino do painel continua funcionando.</p>
        </div>
        {mine === null ? <Loader2 className="mt-1 h-5 w-5 animate-spin text-muted-foreground" /> : <Switch checked={mine} onCheckedChange={(v) => void toggleMine(v)} aria-label="Receber alertas no meu e-mail" className="mt-1" />}
      </div>
      {manager && <Gestor />}
    </div>
  );
}

function Gestor() {
  const [cfg, setCfg] = useState<EmailSettings | null>(null);
  const [extra, setExtra] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await requireSupabase().rpc("notification_settings_get" as never);
    if (error) { setErr(notReady(error) ? NOT_READY_MSG : friendlyError(error)); return; }
    const parsed = parseEmailSettings(data);
    if (!parsed) { setErr("Resposta inesperada do servidor."); return; }
    setCfg(parsed); setExtra(parsed.extra_emails.join("\n"));
  }, []);
  useEffect(() => {
    void load();
    void getEmailStatus().then((s) => { if (s.ok) setStatus({ configured: s.configured, missing: s.missing, appUrl: s.appUrl }); }).catch(() => undefined);
  }, [load]);

  if (err) return <ErrorState message={err} onRetry={load} />;
  if (!cfg) return <ListSkeleton rows={3} />;

  async function save(): Promise<void> {
    if (!cfg) return;
    const p = settingsPayload({ email_enabled: cfg.email_enabled, email_kinds: cfg.email_kinds, extraText: extra });
    if (!p.ok) { toast.error(p.error === "INVALID_EMAIL" ? "Confira os e-mails extras: algum está inválido." : "No máximo 10 e-mails extras."); return; }
    setBusy("save");
    const { error } = await requireSupabase().rpc("notification_settings_save" as never, { _cfg: p.payload } as never);
    setBusy(null);
    if (error) { toast.error(/INVALID_SETTINGS/.test(error.message) ? "Confira os valores informados." : friendlyError(error)); return; }
    toast.success("Configuração salva");
    void load();
  }
  async function test(): Promise<void> {
    setBusy("test");
    const { error } = await requireSupabase().rpc("email_test_enqueue" as never);
    setBusy(null);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(status?.configured ? "E-mail de teste na fila. Chega em até 1 minuto." : "Teste na fila, mas o envio ainda não está configurado.");
    void load();
  }
  const setKind = (k: AlertKind, v: boolean) => setCfg({ ...cfg, email_kinds: { ...cfg.email_kinds, [k]: v } });

  return (
    <section aria-labelledby="gestor-title" className="space-y-4">
      <h2 id="gestor-title" className="text-lg font-semibold">Alertas por e-mail da rede</h2>

      {status && !status.configured && (
        <div role="status" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">O envio de e-mail ainda não está configurado.</p>
          <p className="mt-1">Os alertas aparecem no sino normalmente. Para enviar por e-mail falta cadastrar no servidor: <span className="font-mono">{status.missing.join(", ")}</span>.</p>
        </div>
      )}
      {status?.configured && !status.appUrl && (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">Dica: cadastre <span className="font-mono">PUBLIC_APP_URL</span> com o endereço do painel para o botão “Abrir no painel” dos e-mails apontar sempre para o endereço certo.</p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Na fila" value={cfg.queue.pending} />
        <StatCard label="Enviados (7 dias)" value={cfg.queue.sent_7d} />
        <StatCard label="Falharam (7 dias)" value={cfg.queue.failed_7d} />
      </div>
      {cfg.queue.last_error && cfg.queue.failed_7d > 0 && <p className="text-xs text-muted-foreground">Último erro: {cfg.queue.last_error}</p>}

      <div className="rounded-2xl bg-card p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1"><p className="font-medium">Enviar alertas por e-mail</p><p className="text-sm text-muted-foreground">Desligue para parar todos os e-mails. O sino continua.</p></div>
          <Switch checked={cfg.email_enabled} onCheckedChange={(v) => setCfg({ ...cfg, email_enabled: v })} aria-label="Enviar alertas por e-mail" />
        </div>
        <ul className={cn("mt-3 divide-y", !cfg.email_enabled && "pointer-events-none opacity-50")}>
          {ALERT_KINDS.map((k) => (
            <li key={k.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{k.label}</p><p className="text-xs text-muted-foreground">{k.hint}</p></div>
              <Switch checked={cfg.email_kinds[k.id]} onCheckedChange={(v) => setKind(k.id, v)} aria-label={k.label} />
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl bg-card p-4 shadow-soft">
        <Label htmlFor="al-extra">Outros e-mails que também recebem (até 10)</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">Por exemplo o e-mail da cozinha ou de um sócio. Um por linha. Recebem os mesmos alertas da rede.</p>
        <Textarea id="al-extra" value={extra} onChange={(e) => setExtra(e.target.value)} rows={3} placeholder="nome@empresa.com.br" className="mt-2 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12" disabled={busy !== null} onClick={test}>{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar e-mail de teste"}</Button>
        <Button className="h-12" disabled={busy !== null} onClick={save}>{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">O teste vai para o seu e-mail de login.</p>
    </section>
  );
}
