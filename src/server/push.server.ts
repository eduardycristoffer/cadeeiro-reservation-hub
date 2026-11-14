// Alertas no popup (Web Push). Só roda no servidor.
// A chave VAPID é derivada de um segredo que o servidor já tem (PUSH_SEED, se existir; senão a chave de serviço do banco),
// então não há nada novo para configurar. Trocar o segredo troca a chave: os aparelhos reativam sozinhos ao abrir o app.
import { buildPushMessage, deriveVapidKeys, sendWebPush, type VapidKeys } from "@/lib/integration/webpush";
import { rpc } from "./sdr.server";

function seed(): string | null {
  const v = process.env["PUSH_SEED"]?.trim() || process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  return v && v.length >= 16 ? v : null;
}

export async function pushKeys(): Promise<VapidKeys | null> {
  const s = seed();
  if (!s) return null;
  try { return await deriveVapidKeys(s); } catch { return null; }
}

/** Chave pública que o navegador usa para criar a assinatura. */
export async function pushPublicKey(): Promise<string | null> {
  return (await pushKeys())?.publicKey ?? null;
}

/** Quem identifica o servidor de envio para o serviço de push: um endereço https (o do painel). */
function subject(origin: string): string {
  const fixed = process.env["PUSH_SUBJECT"]?.trim();
  if (fixed && /^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s/]+)/.test(fixed)) return fixed;
  const pub = process.env["PUBLIC_APP_URL"]?.trim();
  try { if (pub) return new URL(pub).origin; } catch { /* usa a origem da requisição */ }
  return origin.startsWith("https://") ? new URL(origin).origin : "https://candeeiro.lovable.app";
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
type Item = { id: string; kind: string; notification_id: string | null; alert_kind: string; severity: string; title: string; body: string | null; link: string | null; subs: Sub[] };
export type PushRun = { ok: true; skipped: "sem_chave" } | { ok: true; claimed: number; sent: number; failed: number; devices: number };

/** Esvazia a fila de popups: manda para cada aparelho da pessoa e registra o resultado. */
export async function runPushWorker(origin: string): Promise<PushRun> {
  const keys = await pushKeys();
  if (!keys) return { ok: true, skipped: "sem_chave" };
  const sub = subject(origin);
  const items = (await rpc<Item[] | null>("sdr_push_claim", { _limit: 30 })) ?? [];
  let sent = 0, failed = 0, devices = 0;
  for (let i = 0; i < items.length; i += 5) {
    await Promise.all(items.slice(i, i + 5).map(async (it) => {
      const msg = buildPushMessage({ id: it.notification_id ?? it.id, title: it.title, body: it.body, link: it.link, severity: it.severity, kind: it.alert_kind });
      let ok = 0, retry = false, lastError: string | null = null;
      for (const s of it.subs) {
        const r = await sendWebPush(keys, sub, s, msg, { urgency: it.severity === "info" ? "normal" : "high" });
        if (r.ok) { ok++; devices++; await rpc("sdr_push_sub_result", { _sub: s.id, _ok: true }); continue; }
        lastError = r.error;
        if (r.retry) retry = true;
        await rpc("sdr_push_sub_result", { _sub: s.id, _ok: false, _gone: r.gone, _error: r.error });
      }
      // sem nenhum aparelho (ex.: todos já morreram) o aviso é cancelado, não "falhou"
      await rpc("sdr_push_mark", { _id: it.id, _sent: ok, _retry: retry, _error: it.subs.length === 0 ? null : lastError ?? "erro" });
      if (ok > 0) sent++; else failed++;
    }));
  }
  return { ok: true, claimed: items.length, sent, failed, devices };
}
