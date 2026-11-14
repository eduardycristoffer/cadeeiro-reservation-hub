import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError, requireSupabase } from "@/lib/supabase";

type Factor = { id: string; status: string };
type Enroll = { id: string; qr: string; secret: string };

/** Só números, no máximo 6. */
export const onlyCode = (v: string) => v.replace(/\D/g, "").slice(0, 6);

/**
 * Verificação em duas etapas (app autenticador, TOTP) — opcional, cada pessoa liga ou desliga a sua.
 * Quem não ligar entra só com e-mail e senha.
 */
export function TwoFactorCard() {
  const [factor, setFactor] = useState<Factor | null | undefined>(undefined);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await requireSupabase().auth.mfa.listFactors();
    if (error) return setFactor(null);
    const t = (data?.totp ?? []).find((f) => f.status === "verified") ?? null;
    setFactor(t ? { id: t.id, status: t.status } : null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  /** Fatores que ficaram pela metade (QR lido mas código nunca confirmado) atrapalham um novo cadastro. */
  async function clearUnverified() {
    const sb = requireSupabase();
    const { data } = await sb.auth.mfa.listFactors();
    for (const f of data?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id });
  }

  async function start() {
    setBusy(true); setMsg(null);
    try {
      await clearUnverified();
      const { data, error } = await requireSupabase().auth.mfa.enroll({ factorType: "totp", friendlyName: "Candeeiro" });
      if (error || !data) throw error ?? new Error("enroll");
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } catch (e) { setMsg(friendlyError(e)); }
    setBusy(false);
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy(true); setMsg(null);
    const { error } = await requireSupabase().auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
    setBusy(false);
    if (error) return setMsg(/invalid|expired/i.test(error.message) ? "Código incorreto. Confira o app e tente de novo." : friendlyError(error));
    void requireSupabase().rpc("log_auth_event", { _action: "2fa_ativado" });
    setEnroll(null); setCode("");
    toast.success("2FA ativado");
    void load();
  }

  async function cancel() {
    if (enroll) await requireSupabase().auth.mfa.unenroll({ factorId: enroll.id }).catch(() => undefined);
    setEnroll(null); setCode(""); setMsg(null);
  }

  async function disable() {
    if (!factor) return;
    setBusy(true); setMsg(null);
    const { error } = await requireSupabase().auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    if (error) return setMsg(friendlyError(error));
    void requireSupabase().rpc("log_auth_event", { _action: "2fa_desativado" });
    toast.success("2FA desativado. Você entra só com e-mail e senha.");
    void load();
  }

  return (
    <section aria-labelledby="pf-2fa" className="mt-4 space-y-3 rounded-3xl bg-card p-5 shadow-soft">
      <div className="flex items-start gap-3">
        {factor ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-status-confirmed" aria-hidden="true" /> : <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <div className="min-w-0">
          <h2 id="pf-2fa" className="font-semibold">Verificação em duas etapas</h2>
          <p className="text-sm text-muted-foreground">
            {factor ? "Ativada. Depois da senha, o painel pede o código de 6 números do seu app autenticador." : "Opcional. Sem ela você entra só com e-mail e senha. Com ela, o painel também pede um código do seu celular."}
          </p>
        </div>
      </div>

      {factor === undefined ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" /> : enroll ? (
        <form onSubmit={confirm} className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Abra um app autenticador (Google Authenticator, Microsoft Authenticator, Authy…).</li>
            <li>Escaneie o QR code abaixo{" "}ou digite a chave.</li>
            <li>Digite aqui o código de 6 números que o app mostrar.</li>
          </ol>
          <div className="flex justify-center rounded-2xl bg-white p-3">
            <img src={enroll.qr} alt="QR code para o app autenticador" className="h-44 w-44" />
          </div>
          <p className="break-all rounded-xl bg-surface px-3 py-2 text-center font-mono text-xs select-all" aria-label="Chave para digitar no app">{enroll.secret}</p>
          <div className="space-y-1.5">
            <Label htmlFor="pf-2fa-code">Código de 6 números</Label>
            <Input id="pf-2fa-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(onlyCode(e.target.value))} className="h-12 rounded-xl text-center font-mono text-lg tracking-[0.4em]" />
          </div>
          {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => void cancel()}>Cancelar</Button>
            <Button type="submit" className="h-11" disabled={busy || code.length !== 6}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ativar"}</Button>
          </div>
        </form>
      ) : (
        <>
          {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
          {factor
            ? <Button variant="outline" className="h-11 w-full sm:w-auto" disabled={busy} onClick={() => void disable()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Desativar 2FA"}</Button>
            : <Button className="h-11 w-full sm:w-auto" disabled={busy} onClick={() => void start()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ativar 2FA"}</Button>}
          {factor && <p className="text-xs text-muted-foreground">Perdeu o celular? Peça a um admin para remover o 2FA da sua conta.</p>}
        </>
      )}
    </section>
  );
}
