import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sdr/emails/run")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/sdr-handlers.server")).runEmails(request),
    },
  },
});
