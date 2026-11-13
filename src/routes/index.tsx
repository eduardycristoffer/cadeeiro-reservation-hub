import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Beef, Pizza, Utensils, type LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { PublicExtras } from "@/components/public/PublicExtras";
import { CITIES, sanitizeCampaign } from "@/lib/reserva";
import { SERVICES, SERVICE_LABEL, type ServiceId } from "@/lib/reservations";

const ICON: Record<ServiceId, LucideIcon> = { rodizio_carnes: Beef, rodizio_pizza: Pizza, almoco_quilo: Utensils };
const SLUG = Object.fromEntries(SERVICES.map((s) => [s.id, s.slug])) as Record<ServiceId, string>;
const BLURB: Record<string, string> = {
  goiania: "Almoço por quilo e rodízio de pizza.",
  anapolis: "Rodízio de carnes e rodízio de pizza.",
};

/** Página inicial: primeiro a cidade, depois o que a pessoa quer comer. */
export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { campanha?: string | undefined } => ({ campanha: sanitizeCampaign(s["campanha"]) }),
  head: () => ({
    meta: [
      { title: "Rede Candeeiro — Goiânia e Anápolis" },
      { name: "description", content: "Reserve sua mesa no Candeeiro. Goiânia: almoço por quilo e rodízio de pizza. Anápolis: rodízio de carnes e de pizza." },
      { property: "og:title", content: "Rede Candeeiro — Goiânia e Anápolis" },
      { property: "og:description", content: "Escolha a cidade e reserve sua mesa em menos de um minuto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { campanha } = Route.useSearch();
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 pb-28 pt-4 sm:px-8">
        <header className="flex items-center justify-end">
          <a href="/entrar" className="rounded-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Área da equipe</a>
        </header>

        <main className="flex flex-1 flex-col justify-center py-8">
          <div className="fade-up text-center">
            <BrandLogo className="mx-auto h-20 sm:h-24" />
            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Reserve sua mesa.</h1>
            <p className="mt-3 text-lg text-muted-foreground sm:text-xl">Em qual cidade você quer comer?</p>
          </div>

          <div className="fade-up mt-10 grid gap-4 sm:grid-cols-2 sm:gap-6">
            {CITIES.map((c) => (
              <section key={c.slug} aria-labelledby={`cidade-${c.slug}`} className="rounded-[2rem] bg-surface p-6 shadow-soft sm:p-8">
                <h2 id={`cidade-${c.slug}`} className="text-3xl font-bold tracking-tight sm:text-4xl">{c.label}</h2>
                <p className="mt-1.5 text-base text-muted-foreground">{BLURB[c.slug]}</p>
                <ul className="mt-6 flex flex-col gap-3">
                  {c.services.map((id) => {
                    const Icon = ICON[id];
                    return (
                      <li key={id}>
                        <Link
                          to="/reservar"
                          search={{ cidade: c.slug, rodizio: SLUG[id] as "carnes" | "pizza" | "quilo", campanha }}
                          className="group flex min-h-16 items-center gap-4 rounded-2xl bg-card px-5 py-4 shadow-soft transition active:scale-[0.99] hover:shadow-lift"
                        >
                          <Icon className="size-6 shrink-0 text-brand-ink" aria-hidden="true" />
                          <span className="flex-1 text-lg font-semibold">{SERVICE_LABEL[id]}</span>
                          <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">Reservar</span>
                          <ArrowUpRight className="size-5 text-muted-foreground" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </main>

        <footer className="pt-6 text-center text-xs text-muted-foreground">
          Seus dados são usados só para a sua reserva e atendimento (LGPD).
        </footer>
      </div>
      <PublicExtras campaign={campanha} />
    </div>
  );
}
