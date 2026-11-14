import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // abre o código da tela assim que o dedo/mouse chega no link: o toque seguinte já encontra tudo pronto
    defaultPreload: "intent",
    defaultPreloadDelay: 40,
  });

  return router;
};
