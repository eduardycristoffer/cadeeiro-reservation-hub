import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sdr/crm/sends")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/sdr-handlers.server")).markCrmSend(request),
    },
  },
});
