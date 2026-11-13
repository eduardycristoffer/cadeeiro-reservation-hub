import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { PublicExtras, WhatsAppCta } from "@/components/public/PublicExtras";
import { ReservaFlow } from "@/components/reserva/ReservaFlow";
import { citySlug } from "@/lib/reserva";
import { SERVICES, type ServiceId } from "@/lib/reservations";
import { supabase } from "@/lib/supabase";

/**
 * Página de campanha: /c/<endereço>?utm_source=instagram&utm_campaign=<endereço>
 * O gestor cria no painel (Campanhas): escolhe cidade, rodízio, título e botão. Toda reserva ou lead
 * que nascer aqui fica gravado com o nome da campanha, para o relatório de Anúncios calcular o CAC.
 */
export const Route = createFileRoute("/c/$slug")({
  head: () => ({
    meta: [
      { title: "Reserve sua mesa — Rede Candeeiro" },
      { name: "description", content: "Reserve sua mesa na Rede Candeeiro em menos de um minuto." },
      { property: "og:title", content: "Reserve sua mesa — Rede Candeeiro" },
      { property: "og:description", content: "Rodízio de carnes, rodízio de pizza e almoço por quilo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CampaignPage,
});

type Cfg = { slug: string; kind: "reserva" | "whatsapp"; headline: string; subheadline: string | null; city: string | null; service: string | null; campaign: string; cta_label: string };
type State = { s: "loading" } | { s: "missing" } | { s: "ready"; cfg: Cfg };

function parseCfg(data: unknown): Cfg | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const kind = d["kind"] === "whatsapp" ? "whatsapp" : d["kind"] === "reserva" ? "reserva" : null;
  const slug = str(d["slug"]), campaign = str(d["campaign"]);
  if (!kind || !slug || !campaign) return null;
  return { slug, kind, campaign, headline: str(d["headline"]) ?? "Reserve sua mesa", subheadline: str(d["subheadline"]), city: str(d["city"]), service: str(d["service"]), cta_label: str(d["cta_label"]) ?? "Reservar agora" };
}

function CampaignPage() {
  const { slug } = Route.useParams();
  const [st, setSt] = useState<State>({ s: "loading" });

  useEffect(() => {
    if (!supabase) { setSt({ s: "missing" }); return; }
    let off = false;
    void supabase.rpc("public_campaign_page", { _slug: slug }).then(({ data, error }) => {
      if (off) return;
      const cfg = error ? null : parseCfg(data);
      setSt(cfg ? { s: "ready", cfg } : { s: "missing" });
    }, () => { if (!off) setSt({ s: "missing" }); });
    return () => { off = true; };
  }, [slug]);

  if (st.s === "loading") {
    return <main className="flex min-h-screen items-center justify-center bg-surface"><Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Carregando" /></main>;
  }
  if (st.s === "missing") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
        <BrandLogo className="h-16" />
        <h1 className="mt-6 text-2xl font-semibold">Esta oferta não está mais disponível</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">Mas você ainda pode reservar sua mesa normalmente.</p>
        <Button asChild className="mt-6 h-12 rounded-2xl px-6"><Link to="/reservar">Reservar mesa</Link></Button>
      </main>
    );
  }

  const { cfg } = st;
  const city = citySlug(cfg.city) ?? undefined;

  if (cfg.kind === "reserva") {
    const service = SERVICES.find((x) => x.id === cfg.service)?.id as ServiceId | undefined;
    return (
      <>
        <ReservaFlow initialService={service} city={city} campaign={cfg.campaign} pageSlug={cfg.slug}
          copy={{ headline: cfg.headline, subheadline: cfg.subheadline, cta: cfg.cta_label }} />
        <PublicExtras city={city} campaign={cfg.campaign} />
      </>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface px-5 py-8">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="fade-up text-center">
          <BrandLogo className="mx-auto h-20" />
          <h1 className="mt-6 text-3xl font-bold leading-tight sm:text-4xl">{cfg.headline}</h1>
          {cfg.subheadline && <p className="mt-3 text-base text-muted-foreground">{cfg.subheadline}</p>}
          <div className="mt-8"><WhatsAppCta city={city} campaign={cfg.campaign} label={cfg.cta_label} /></div>
          <p className="mt-4 text-xs text-muted-foreground">Você escolhe a cidade e abrimos o WhatsApp certo.</p>
        </div>
      </div>
      <PublicExtras city={city} campaign={cfg.campaign} />
    </main>
  );
}
