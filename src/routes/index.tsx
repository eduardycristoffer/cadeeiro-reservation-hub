import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rede Cadeeiro — Reserve sua mesa" },
      { name: "description", content: "Reserve sua mesa em uma das unidades da Rede Cadeeiro em poucos toques." },
      { property: "og:title", content: "Rede Cadeeiro — Reserve sua mesa" },
      { property: "og:description", content: "Reserve sua mesa em uma das unidades da Rede Cadeeiro." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/reservar" });
  },
});
