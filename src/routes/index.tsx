import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
      { title: "Rede Candeeiro — Reserve sua mesa" },
      { name: "description", content: "Reserve sua mesa em uma das unidades da Rede Candeeiro em poucos toques." },
      { property: "og:title", content: "Rede Candeeiro — Reserve sua mesa" },
      { property: "og:description", content: "Reserve sua mesa em uma das unidades da Rede Candeeiro." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/reservar" });
  },
});
