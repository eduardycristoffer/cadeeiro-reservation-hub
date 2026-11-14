import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => (await import("@/server/wifi-webhook.server")).handleWifiHook(request, params.token),
      GET: async ({ request, params }) => (await import("@/server/wifi-webhook.server")).handleWifiHook(request, params.token),
    },
  },
});
