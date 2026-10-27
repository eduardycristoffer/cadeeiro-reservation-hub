import { createFileRoute } from "@tanstack/react-router";
import { ReservaFlow } from "@/components/reserva/ReservaFlow";
import { sanitizeCampaign } from "@/lib/reserva";

export const Route = createFileRoute("/goiania/pizza")({
  validateSearch: (s: Record<string, unknown>): { campanha?: string | undefined } => ({ campanha: sanitizeCampaign(s["campanha"]) }),
  head: () => ({
    meta: [
      { title: "Rodízio de pizza em Goiânia — Candeeiro" },
      { name: "description", content: "Reserve sua mesa no rodízio de pizza do Candeeiro Goiânia." },
      { property: "og:title", content: "Rodízio de pizza em Goiânia — Candeeiro" },
      { property: "og:description", content: "Sua mesa no rodízio de pizza em menos de um minuto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GoianiaPizza,
});

function GoianiaPizza() {
  const { campanha } = Route.useSearch();
  return <ReservaFlow initialService="rodizio_pizza" city="goiania" campaign={campanha} />;
}
