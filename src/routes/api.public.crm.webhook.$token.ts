import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/crm/webhook/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => (await import("@/server/crm-webhook.server")).handleCrmWebhook(request, params.token),
    },
  },
});
