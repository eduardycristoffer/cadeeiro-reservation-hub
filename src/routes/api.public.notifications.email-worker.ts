import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Mesmas filas do /api/public/sdr/emails/run (e-mail + popup), para o agendador da plataforma (LOVABLE_CRON_SECRET). */
export const Route = createFileRoute("/api/public/notifications/email-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { runNotificationsWorker } = await import("@/server/notifications-worker.server");
        return Response.json(await runNotificationsWorker(new URL(request.url).origin));
      },
    },
  },
});
