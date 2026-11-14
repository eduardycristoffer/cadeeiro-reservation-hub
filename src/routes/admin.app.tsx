import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, Copy, Loader2, MessageCircle, Monitor, RefreshCw, Send, Smartphone, Tablet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { InstallAction, OtherDevices } from "@/components/app/InstallGuide";
import { EmptyState } from "@/components/admin/bits";
import { Button } from "@/components/ui/button";
import { DENIED_HELP, PUSH_SUPPORT_TEXT, installPageUrl, seenAgo, whatsappShareUrl } from "@/lib/app";
import { updateApp, useInstall, usePush } from "@/lib/app-state";
import { sendTestPush } from "@/lib/push.functions";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/app")({
  head: () => ({ meta: [{ title: "App — Candeeiro Gestão" }, { name: "description", content: "Instale o app e ligue os alertas no popup." }, { property: "og:title", content: "App — Candeeiro Gestão" }, { property: "og:description", content: "Instale o app e ligue os alertas no popup." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: AppTab,
});

type Device = { id: string; device_label: string | null; created_at: string; last_seen_at: string; last_success_at: string | null; failures: number; disabled: boolean; endpoint_tail: string };
const notReady = (e: { message?: string; code?: string } | null) => !!e && (e.code === "PGRST202" || e.code === "42P01" || /could not find the function|does not exist|schema cache/i.test(e.message ?? ""));

function Card({ title, children, className, id }: { title: string; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={cn("rounded-3xl bg-card p-5 shadow-soft", className)}>
      <h2 id={id} className="font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function AppTab() {
  const { standalone, env, ready, plan } = useInstall();
  return (
    <div className="fade-up mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold sm:text-4xl">App</h1>
      <p className="mt-1 text-sm text-muted-foreground">Instale o Candeeiro no celular e receba os alertas no popup, mesmo com o app fechado.</p>

      <div className="mt-6 space-y-4">
        <Card title={standalone ? "Este aparelho" : "Instalar neste aparelho"} id="app-install">
          {ready && plan?.mode === "installed" ? (
            <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-status-confirmed-bg text-status-confirmed"><Check className="h-5 w-5" aria-hidden="true" /></span>
              <div><p className="font-medium">App instalado</p><p className="text-sm text-muted-foreground">Você está usando o app em tela cheia.</p></div></div>
          ) : <InstallAction size="lg" />}
        </Card>

        <PushCard />
        <DevicesCard />

        {!standalone && env && env.mobile && null}
        <ShareCard />
        <Card title="Atualização" id="app-update">
          <p className="text-sm text-muted-foreground">O app se atualiza sozinho. Se algo parecer antigo ou travado, force a atualização.</p>
          <Button variant="outline" className="mt-3 h-11" onClick={() => { void updateApp().then((r) => { if (r === "unavailable") { toast.info("Nada para atualizar: o app só guarda cache no site publicado."); } }); }}><RefreshCw /> Buscar atualização</Button>
        </Card>
      </div>
    </div>
  );
}

function PushCard() {
  const push = usePush();
  const { standalone, plan } = useInstall();
  const [testing, setTesting] = useState(false);

  async function turnOn() {
    const r = await push.enable();
    if (r.ok) { toast.success("Alertas ligados neste aparelho"); return; }
    if (r.error === "denied") toast.error("Os alertas estão bloqueados. Veja como liberar logo abaixo.");
    else if (r.error === "dismissed") toast.info("Sem a permissão, os alertas não aparecem. Toque de novo para ligar.");
    else if (r.error === "server") toast.error("O servidor ainda não está pronto para enviar alertas. Avise o suporte.");
    else if (r.error === "no-worker") toast.error("O app ainda está carregando. Aguarde alguns segundos e tente de novo. (Só funciona no site publicado.)");
    else if (r.error === "db") toast.error(r.message ?? "Não foi possível ligar agora.");
    else toast.error("Este aparelho não conseguiu ligar os alertas.");
  }

  async function test() {
    setTesting(true);
    try {
      const r = await sendTestPush();
      if (r.ok) toast.success(r.delivered > 0 ? "Teste enviado. O popup deve aparecer em instantes." : "O serviço de alertas não entregou agora. Tente de novo em um minuto.");
      else toast.error(r.error === "TOO_FAST" ? "Espere uns segundos antes de testar de novo." : r.error === "NO_DEVICE" ? "Ligue os alertas neste aparelho primeiro." : r.error === "SERVER_NOT_READY" ? "O servidor ainda não está pronto para enviar alertas." : r.error === "NOT_READY" ? "Os alertas ainda não foram ativados neste ambiente (falta aplicar a migração 020)." : "Não foi possível testar agora.");
    } catch { toast.error("Não foi possível testar agora."); }
    setTesting(false);
  }

  return (
    <Card title="Alertas no popup" id="app-push">
      {!push.ready || push.support === null ? <div className="h-12 animate-pulse rounded-2xl bg-surface" aria-hidden="true" /> :
        push.support !== "ok" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{PUSH_SUPPORT_TEXT[push.support]}</p>
            {push.support === "ios-instalar" && !standalone && plan && plan.steps.length > 0 && <InstallAction size="lg" />}
          </div>
        ) : push.permission === "denied" ? (
          <p role="alert" className="rounded-2xl bg-status-cancelled-bg p-4 text-sm leading-snug text-status-cancelled">{DENIED_HELP}</p>
        ) : push.on ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-status-confirmed-bg text-status-confirmed"><BellRing className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-0"><p className="font-medium">Ligados neste aparelho</p><p className="text-sm text-muted-foreground">Você recebe reserva nova, cancelamento, SAC e falhas de envio da sua unidade.</p></div></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="h-12" onClick={() => void test()} disabled={testing}>{testing ? <Loader2 className="animate-spin" /> : <Send />} Enviar alerta de teste</Button>
              <Button variant="outline" className="h-12" onClick={() => void push.disable().then(() => toast.success("Alertas desligados neste aparelho"))} disabled={push.busy}>Desligar neste aparelho</Button>
            </div>
            <p className="text-xs text-muted-foreground">Escolha quais tipos de alerta aparecem em <Link to="/admin/perfil" className="font-medium text-foreground underline underline-offset-2">Meu perfil</Link>.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Receba um aviso na tela quando chegar reserva para aprovar, grupo grande, cancelamento ou chamado no SAC.</p>
            <Button size="lg" variant="brand" className="h-12 w-full" onClick={() => void turnOn()} disabled={push.busy || push.on === null}>
              {push.busy ? <Loader2 className="animate-spin" /> : <BellRing />} Ligar alertas neste aparelho
            </Button>
            {push.permission === "default" && <p className="text-xs text-muted-foreground">O aparelho vai pedir permissão. Toque em Permitir.</p>}
          </div>
        )}
    </Card>
  );
}

function DevicesCard() {
  const [rows, setRows] = useState<Device[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const push = usePush();

  const load = useCallback(async () => {
    const { data, error } = await requireSupabase().rpc("push_devices" as never);
    if (error) { if (notReady(error)) setHidden(true); else toast.error(friendlyError(error)); setRows([]); return; }
    setRows((data ?? []) as unknown as Device[]);
    try { const reg = await navigator.serviceWorker?.getRegistration("/"); const sub = await reg?.pushManager.getSubscription(); setCurrent(sub ? sub.endpoint.slice(-12) : null); } catch { setCurrent(null); }
  }, []);
  useEffect(() => { void load(); }, [load, push.on]);

  if (hidden) return null;
  async function remove(d: Device) {
    setBusyId(d.id);
    const { error } = await requireSupabase().rpc("push_device_remove" as never, { _id: d.id } as never);
    setBusyId(null);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Aparelho removido");
    if (d.endpoint_tail === current) await push.refresh();
    void load();
  }
  const Icon = (l: string | null) => (/Windows|Mac|Linux/.test(l ?? "") ? Monitor : /iPhone|Android/.test(l ?? "") ? Smartphone : Tablet);

  return (
    <Card title="Seus aparelhos com alertas" id="app-devices">
      {rows === null ? <div className="h-16 animate-pulse rounded-2xl bg-surface" aria-hidden="true" /> : rows.length === 0 ? (
        <EmptyState icon={Smartphone} title="Nenhum aparelho ligado" text="Ligue os alertas neste aparelho para ele aparecer aqui." />
      ) : (
        <ul className="divide-y">
          {rows.map((d) => {
            const I = Icon(d.device_label);
            const mine = d.endpoint_tail === current;
            return (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface"><I className="h-5 w-5 text-muted-foreground" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium leading-tight">{d.device_label ?? "Aparelho"}{mine && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 align-middle text-[11px] font-semibold text-primary-foreground">este</span>}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {d.disabled ? "Desligado por falhas. Abra o app nele para reativar." : d.failures > 0 ? `Última entrega falhou · visto ${seenAgo(d.last_seen_at)}` : `Visto ${seenAgo(d.last_seen_at)}`}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label={`Remover ${d.device_label ?? "aparelho"}`} onClick={() => void remove(d)} disabled={busyId === d.id}>
                  {busyId === d.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ShareCard() {
  const [url, setUrl] = useState("/app");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setUrl(installPageUrl(window.location.origin)); }, []);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); toast.success("Link copiado"); setTimeout(() => setCopied(false), 2500); }
    catch { toast.error("Não consegui copiar o link."); }
  }
  return (
    <Card title="Passar o app para a equipe" id="app-share">
      <p className="text-sm text-muted-foreground">Mande este link. Ele abre uma página só com o passo a passo certo para o celular de cada pessoa.</p>
      <p className="mt-3 break-all rounded-2xl bg-surface px-4 py-3 text-sm font-medium" data-testid="app-link">{url}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button variant="outline" className="h-12" onClick={() => void copy()}>{copied ? <Check /> : <Copy />} Copiar link</Button>
        <Button asChild variant="outline" className="h-12"><a href={whatsappShareUrl(url)} target="_blank" rel="noopener noreferrer"><MessageCircle /> Enviar no WhatsApp</a></Button>
      </div>
      <details className="group mt-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">Ver o passo a passo de cada aparelho<span className="text-muted-foreground transition group-open:rotate-180" aria-hidden="true">⌄</span></summary>
        <OtherDevices className="mt-3" />
      </details>
    </Card>
  );
}
