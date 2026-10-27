import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sdr/followups/due")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/sdr-handlers.server")).followupsDue(request),
    },
  },
});
