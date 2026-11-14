import { createFileRoute } from "@tanstack/react-router";
import { ReservaFlow } from "@/components/reserva/ReservaFlow";
import { PublicExtras } from "@/components/public/PublicExtras";
import { sanitizeCampaign, serviceFromSlug, serviceSlug, type ServiceSlug } from "@/lib/reserva";
import { cidadeValida, servicoValido, ofertaAceita, type Cidade } from "@/lib/oferta";
import type { ServiceId } from "@/lib/reservations";

type Search = { rodizio?: ServiceSlug | undefined; campanha?: string | undefined; cidade?: Cidade | undefined; servico?: ServiceId | undefined };

/**
 * Link geral: /reservar (o cliente escolhe o rodízio na capa).
 * Link de campanha: /reservar?rodizio=carnes&campanha=black-friday (rodízio já definido; campanha gravada na reserva).
 * Da página inicial: /reservar?cidade=goiania&rodizio=quilo (cidade restringe unidades e opções).
 */
export const Route = createFileRoute("/reservar/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    rodizio: serviceSlug(s["rodizio"]),
    campanha: sanitizeCampaign(s["campanha"]),
    cidade: cidadeValida(s["cidade"]),
    servico: servicoValido(s["servico"]),
  }),
  head: () => ({
    meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
      { title: "Reservar mesa — Rede Candeeiro" },
      { name: "description", content: "Reserve sua mesa no Candeeiro Goiânia ou Anápolis: almoço por quilo, rodízio de carnes e pizza conforme a cidade." },
      { property: "og:title", content: "Reservar mesa — Rede Candeeiro" },
      { property: "og:description", content: "Sua reserva na Rede Candeeiro em menos de um minuto." },
    ],
  }),
  component: ReservarPage,
});

function ReservarPage() {
  const { rodizio, campanha, cidade, servico } = Route.useSearch();
  const selected = servico ?? serviceFromSlug(rodizio);
  return (
    <>
      <ReservaFlow initialService={selected && (!cidade || ofertaAceita(cidade, selected)) ? selected : undefined} campaign={campanha} city={cidade} />
      <PublicExtras city={cidade} campaign={campanha} />
    </>
  );
}
