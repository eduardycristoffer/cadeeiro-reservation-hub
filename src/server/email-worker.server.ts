// Esvazia a fila de e-mails (email_outbox): pega o que está pendente, envia e registra o resultado.
// Chamado a cada minuto pelo n8n (POST /api/public/sdr/emails/run) ou pelo cron da plataforma.
import { mailForQueued } from "@/lib/email-queue";
import { emailConfig, sendEmail } from "./email.server";
import { rpc } from "./sdr.server";
import { publicOrigin } from "@/lib/site";

type Row = { id: string; to: string; subject: string; text: string; link_path: string | null; kind: string };
export type EmailRun = { ok: true; skipped: "sem_provedor" } | { ok: true; claimed: number; sent: number; failed: number };

export async function runEmailWorker(origin: string): Promise<EmailRun> {
  const cfg = emailConfig();
  // sem provedor configurado a fila fica parada e nenhuma tentativa é gasta
  if (!cfg) return { ok: true, skipped: "sem_provedor" };
  const base = publicOrigin(process.env["PUBLIC_APP_URL"]?.trim() || origin);
  const rows = (await rpc<Row[] | null>("sdr_email_claim", { _limit: 20 })) ?? [];
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += 5) {
    await Promise.all(rows.slice(i, i + 5).map(async (r) => {
      const res = await sendEmail(cfg, r.to, mailForQueued(r, base));
      await rpc("sdr_email_mark", { _id: r.id, _ok: res.ok, _error: res.ok ? null : res.error });
      if (res.ok) sent++; else failed++;
    }));
  }
  return { ok: true, claimed: rows.length, sent, failed };
}
