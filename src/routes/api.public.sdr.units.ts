import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sdr/units")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/sdr-handlers.server")).listUnits(request),
    },
  },
});
