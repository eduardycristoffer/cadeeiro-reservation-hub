import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sdr/handoff")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/sdr-handlers.server")).handoff(request),
    },
  },
});
