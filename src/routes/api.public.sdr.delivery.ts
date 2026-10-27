import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sdr/delivery")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/sdr-handlers.server")).findDelivery(request),
      POST: async ({ request }) => (await import("@/server/sdr-handlers.server")).createDelivery(request),
    },
  },
});
