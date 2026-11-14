// Rodada única de notificações: e-mails + popups (Web Push). Um não depende do outro:
// sem provedor de e-mail os popups continuam saindo, e vice-versa.
import { runEmailWorker, type EmailRun } from "./email-worker.server";
import { runPushWorker, type PushRun } from "./push.server";

export type NotificationsRun = EmailRun & { push: PushRun | { ok: false; error: string } };

export async function runNotificationsWorker(origin: string): Promise<NotificationsRun> {
  const [email, push] = await Promise.all([
    runEmailWorker(origin),
    runPushWorker(origin).catch((): { ok: false; error: string } => ({ ok: false, error: "push_falhou" })),
  ]);
  return { ...email, push };
}
