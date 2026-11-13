import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Mesma fila do /api/public/sdr/emails/run, para o agendador da plataforma (LOVABLE_CRON_SECRET). */
export const Route = createFileRoute("/api/public/notifications/email-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { runEmailWorker } = await import("@/server/email-worker.server");
        return Response.json(await runEmailWorker(new URL(request.url).origin));
      },
    },
  },
});
