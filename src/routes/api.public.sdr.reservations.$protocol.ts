import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sdr/reservations/$protocol")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => (await import("@/server/sdr-handlers.server")).patchReservation(request, params.protocol),
    },
  },
});
