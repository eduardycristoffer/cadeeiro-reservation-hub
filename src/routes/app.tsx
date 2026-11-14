import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BellRing, Check, Copy, MessageCircle, WifiOff, Zap } from "lucide-react";
import { toast } from "sonner";
import { InstallAction, OtherDevices } from "@/components/app/InstallGuide";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { installPageUrl, whatsappShareUrl } from "@/lib/app";
import { useInstall } from "@/lib/app-state";

/** Página de download do app. Não aparece em nenhum menu: a equipe chega por este endereço (/app). */
export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Baixar o app — Candeeiro" },
      { name: "description", content: "Instale o app do Candeeiro no celular: reservas, aprovações e alertas no popup." },
      { property: "og:title", content: "Baixar o app — Candeeiro" },
      { property: "og:description", content: "Reservas, aprovações e alertas da equipe na tela do celular." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BaixarApp,
});

const BENEFITS = [
  { icon: BellRing, title: "Alerta no popup", text: "Reserva nova, grupo grande e SAC aparecem na tela, mesmo com o celular bloqueado." },
  { icon: Zap, title: "Abre em um toque", text: "Ícone na tela inicial, em tela cheia, sem digitar endereço." },
  { icon: WifiOff, title: "Aguenta sinal fraco", text: "Se a internet cair, o app avisa e volta sozinho quando ela voltar." },
] as const;

function BaixarApp() {
  const { standalone, env } = useInstall();
  const [url, setUrl] = useState("/app");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setUrl(installPageUrl(window.location.origin)); }, []);

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); toast.success("Link copiado"); setTimeout(() => setCopied(false), 2500); }
    catch { toast.error("Não consegui copiar. Segure o endereço da barra e copie."); }
  }

  return (
    <div className="min-h-dvh bg-surface">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:max-w-lg">
        <div className="fade-up text-center">
          <img src="/icons/icon-192.png" alt="" width={96} height={96} className="mx-auto h-24 w-24 rounded-[1.6rem] shadow-lift" />
          <h1 className="mt-6 text-[2rem] font-bold leading-[1.1] tracking-tight sm:text-4xl">Baixe o app do Candeeiro</h1>
          <p className="mx-auto mt-3 max-w-sm text-base text-muted-foreground">Reservas, aprovações e atendimento da equipe, direto na tela do seu celular.</p>
        </div>

        <div className="fade-up mt-7"><InstallAction /></div>

        <ul className="mt-8 space-y-3" aria-label="O que você ganha">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-4 rounded-3xl bg-card p-4 shadow-soft">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface"><Icon className="h-5 w-5 text-brand-ink" aria-hidden="true" /></span>
              <span className="min-w-0"><span className="block font-semibold leading-tight">{title}</span><span className="mt-1 block text-sm leading-snug text-muted-foreground">{text}</span></span>
            </li>
          ))}
        </ul>

        {!standalone && env && !env.mobile && (
          <section className="mt-8 rounded-3xl bg-card p-5 shadow-soft" aria-labelledby="ap-cel">
            <h2 id="ap-cel" className="font-semibold">Vai instalar no celular?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Envie este link para o aparelho (ou para a equipe) e abra por lá.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button variant="outline" className="h-12" onClick={() => void copy()}>{copied ? <Check /> : <Copy />} Copiar link</Button>
              <Button asChild variant="outline" className="h-12"><a href={whatsappShareUrl(url)} target="_blank" rel="noopener noreferrer"><MessageCircle /> Enviar no WhatsApp</a></Button>
            </div>
            <h3 className="mb-3 mt-6 text-sm font-semibold text-muted-foreground">Como instalar em cada aparelho</h3>
            <OtherDevices />
          </section>
        )}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Depois de instalar, entre com o e-mail e a senha que o gestor enviou.
        </p>
        <div className="mt-3 text-center">
          <Button asChild variant="ghost" className="h-12 text-base"><Link to="/admin">{standalone ? "Abrir o painel" : "Já tenho o app: abrir o painel"}</Link></Button>
        </div>
      </main>
      <Toaster position="top-center" />
    </div>
  );
}
