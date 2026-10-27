import { createFileRoute } from "@tanstack/react-router";
import { ReservaFlow } from "@/components/reserva/ReservaFlow";
import { sanitizeCampaign, serviceFromSlug, serviceSlug, type ServiceSlug } from "@/lib/reserva";

type Search = { rodizio?: ServiceSlug | undefined; campanha?: string | undefined };

/**
 * Link geral: /reservar (o cliente escolhe o rodízio na capa).
 * Link de campanha: /reservar?rodizio=carnes&campanha=black-friday (rodízio já definido; campanha gravada na reserva).
 */
export const Route = createFileRoute("/reservar/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    rodizio: serviceSlug(s["rodizio"]),
    campanha: sanitizeCampaign(s["campanha"]),
  }),
  head: () => ({
    meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
      { title: "Reservar mesa — Rede Candeeiro" },
      { name: "description", content: "Reserve sua mesa no Candeeiro: rodízio de carnes ou de pizza. Leva menos de um minuto." },
      { property: "og:title", content: "Reservar mesa — Rede Candeeiro" },
      { property: "og:description", content: "Sua reserva na Rede Candeeiro em menos de um minuto." },
    ],
  }),
  component: ReservarPage,
});

function ReservarPage() {
  const { rodizio, campanha } = Route.useSearch();
  return <ReservaFlow initialService={serviceFromSlug(rodizio)} campaign={campanha} />;
}
