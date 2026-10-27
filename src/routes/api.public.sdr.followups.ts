import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sdr/followups")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/sdr-handlers.server")).markFollowup(request),
    },
  },
});
