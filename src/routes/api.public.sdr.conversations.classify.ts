import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sdr/conversations/classify")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/sdr-handlers.server")).classify(request),
    },
  },
});
