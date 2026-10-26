import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sdr/reservations")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/sdr-handlers.server")).findReservations(request),
      POST: async ({ request }) => (await import("@/server/sdr-handlers.server")).createReservation(request),
    },
  },
});
