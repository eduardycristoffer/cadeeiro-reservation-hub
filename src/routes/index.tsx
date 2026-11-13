import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, MapPin, Pizza, Beef, Utensils } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { CIDADES, OFERTA, type Cidade } from "@/lib/oferta";
import { SERVICE_LABEL } from "@/lib/reservations";

export const Route = createFileRoute("/")({
 head: () => ({ meta: [
  { title: "Candeeiro — Goiânia e Anápolis" },
  { name: "description", content: "Escolha sua cidade e reserve no Candeeiro: almoço por quilo em Goiânia, rodízio de carnes em Anápolis e pizza nas duas cidades." },
  { property: "og:title", content: "Candeeiro — Goiânia e Anápolis" },
  { property: "og:description", content: "Sua mesa no Candeeiro. Escolha Goiânia ou Anápolis." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
 ] }), component: Home,
});
function Home() {
 const [city, setCity] = useState<Cidade | null>(null);
 return <div className="min-h-dvh bg-surface">
  <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8"><BrandLogo className="h-14" /><Button asChild variant="ghost" className="h-11 text-xs text-muted-foreground"><Link to="/entrar">Área da equipe</Link></Button></header>
  <main className="mx-auto max-w-5xl px-5 pb-28 pt-4 sm:px-8 sm:pt-14">
   <p className="text-sm font-medium text-brand-ink">Rede Candeeiro</p>
   <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-6xl">Candeeiro.</h1>
   <p className="mt-4 text-base text-muted-foreground">Escolha onde vamos receber você.</p>
   <div className="mt-6 grid gap-3 sm:mt-10 sm:grid-cols-2">{CIDADES.map((c) => <Button key={c} type="button" variant="outline" aria-pressed={city === c} onClick={() => setCity(c)} className={`city-choice h-auto min-h-32 flex-col items-start justify-between rounded-3xl bg-card p-5 text-left shadow-soft sm:min-h-52 sm:p-6 ${city === c ? "ring-2 ring-brand" : ""}`}>
    <div className="flex w-full items-center justify-between"><MapPin className="size-7 text-brand-ink" /><ArrowRight className="size-5 text-muted-foreground" /></div>
    <span className="mt-3 block text-2xl font-semibold sm:mt-6">{OFERTA[c].nome}</span>
    <span className="mt-2 whitespace-normal text-sm font-normal text-muted-foreground">{OFERTA[c].servicos.map((s) => SERVICE_LABEL[s]).join(" · ")}</span>
   </Button>)}</div>
   {city && <section key={city} className="step-slide mt-6 border-t pt-5"><h2 className="text-lg font-semibold">Em {OFERTA[city].nome}, escolha o serviço</h2><div className="mt-3 flex flex-wrap gap-2">{OFERTA[city].servicos.map((s) => { const Icon = s === "almoco_quilo" ? Utensils : s === "rodizio_pizza" ? Pizza : Beef; return <Button asChild key={s} variant="brand" className="h-12 px-4"><Link to="/reservar" search={{ cidade: city, servico: s }}><Icon />{SERVICE_LABEL[s]}<ArrowRight /></Link></Button>; })}</div></section>}
   <footer className="mt-10 border-t pt-5 text-xs text-muted-foreground">Rede Candeeiro · Por Tryade</footer>
  </main>
 </div>;
}
