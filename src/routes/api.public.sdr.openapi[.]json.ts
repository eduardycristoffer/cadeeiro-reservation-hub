import { createFileRoute } from "@tanstack/react-router";
import { buildOpenApi } from "@/lib/integration/openapi";

export const Route = createFileRoute("/api/public/sdr/openapi.json")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        Response.json(buildOpenApi(new URL(request.url).origin), { headers: { "access-control-allow-origin": "*" } }),
    },
  },
});
