import { BrandLogo } from "@/components/BrandLogo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { logBlockedLogin } from "@/lib/auth-log.functions";
import { requestPasswordReset } from "@/lib/password-reset.functions";
import { onlyCode } from "@/components/admin/TwoFactorCard";

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
      { title: "Entrar — Candeeiro Gestão" },
      { name: "description", content: "Acesso da equipe ao painel Candeeiro Gestão." },
      { property: "og:title", content: "Entrar — Candeeiro Gestão" },
      { property: "og:description", content: "Acesso da equipe ao painel." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { senha?: "ok"; motivo?: "inatividade" } => ({
    ...(s["senha"] === "ok" ? { senha: "ok" as const } : {}),
    ...(s["motivo"] === "inatividade" ? { motivo: "inatividade" as const } : {}),
  }),
  component: Entrar,
});

function Entrar() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const search = Route.useSearch();
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState(false);
  /** Passo do código de 6 números: só aparece para quem ligou o 2FA no perfil. */
  const [mfaFactor, setMfaFactor] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  /** Registra o login e entra no painel (comum ao login só com senha e ao login com 2FA). */
  async function finishLogin() {
    if (!supabase) return;
    const { data: allowed } = await supabase.rpc("log_auth_event", { _action: "login" });
    if (allowed === false) {
      await supabase.auth.signOut();
      setLoading(false);
      setMfaFactor(null);
      return setMsg("Seu acesso está desativado ou ainda não foi liberado. Fale com o gestor da unidade.");
    }
    setLoading(false);
    navigate({ to: "/admin" });
  }

  async function onMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !mfaFactor) return;
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactor, code: mfaCode });
    if (error) {
      setLoading(false);
      setMfaCode("");
      return setMsg(/invalid|expired/i.test(error.message) ? "Código incorreto ou vencido. Digite o código atual do app." : "Não foi possível verificar agora. Tente de novo.");
    }
    await finishLogin();
  }

  async function cancelMfa() {
    await supabase?.auth.signOut();
    setMfaFactor(null); setMfaCode(""); setPassword(""); setMsg(null);
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try { await requestPasswordReset({ data: { email } }); setSent(true); }
    catch { setMsg("Não foi possível enviar agora. Tente de novo em instantes."); }
    setLoading(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      if (/banned/i.test(error.message)) {
        logBlockedLogin({ data: { email } }).catch(() => {});
        return setMsg("Seu acesso está desativado. Fale com o gestor da unidade.");
      }
      return setMsg("E-mail ou senha inválidos.");
    }
    // Quem ligou o 2FA ainda precisa do código; quem não ligou entra direto com e-mail e senha.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: fs } = await supabase.auth.mfa.listFactors();
      const f = fs?.totp?.[0];
      if (f) { setLoading(false); setMfaCode(""); setMfaFactor(f.id); return; }
    }
    await finishLogin();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5">
      <div className="fade-up w-full max-w-sm py-6 sm:rounded-3xl sm:bg-card sm:p-8 sm:shadow-soft">
        <BrandLogo className="h-16" />
        <h1 className="mt-2 text-2xl font-semibold">{mfaFactor ? "Código de verificação" : forgot ? "Esqueci minha senha" : "Entrar"}</h1>
        {!isSupabaseConfigured ? (
          <p className="mt-4 text-sm text-muted-foreground">O banco de dados ainda não foi conectado a este projeto.</p>
        ) : mfaFactor ? (
          <form onSubmit={onMfa} className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">Abra o app autenticador e digite o código de 6 números do Candeeiro.</p>
            <div className="space-y-1.5">
              <Label htmlFor="mfa-code">Código</Label>
              <Input id="mfa-code" required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={mfaCode} onChange={(e) => setMfaCode(onlyCode(e.target.value))} className="h-12 rounded-xl text-center font-mono text-lg tracking-[0.4em]" />
            </div>
            {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
            <Button type="submit" size="lg" className="h-12 w-full" disabled={loading || mfaCode.length !== 6}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar e entrar"}</Button>
            <Button type="button" variant="ghost" className="h-11 w-full" onClick={() => void cancelMfa()}>Voltar</Button>
            <p className="pt-1 text-center text-xs text-muted-foreground">Perdeu o celular? Peça ao gestor para remover o 2FA da sua conta.</p>
          </form>
        ) : forgot ? (
          sent ? (
            <div className="mt-4 space-y-4" role="status">
              <p className="text-sm text-muted-foreground">Se esse e-mail tem acesso ao painel, enviamos um link para criar uma senha nova. Ele vale por pouco tempo; confira também a caixa de spam.</p>
              <Button variant="outline" className="h-12 w-full" onClick={() => { setForgot(false); setSent(false); }}>Voltar para o login</Button>
            </div>
          ) : (
            <form onSubmit={onForgot} className="mt-6 space-y-3">
              <p className="text-sm text-muted-foreground">Informe o e-mail do seu acesso. Enviaremos um link para criar uma senha nova.</p>
              <div className="space-y-1.5">
                <Label htmlFor="email-forgot">E-mail</Label>
                <Input id="email-forgot" required type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl" />
              </div>
              {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
              <Button type="submit" size="lg" className="h-12 w-full" disabled={loading || !email}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar link"}</Button>
              <Button type="button" variant="ghost" className="h-11 w-full" onClick={() => { setForgot(false); setMsg(null); }}>Voltar</Button>
            </form>
          )
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" required type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl" />
            </div>
            {search.motivo === "inatividade" && !msg && search.senha !== "ok" && <p role="status" className="text-sm text-muted-foreground">Você saiu por ficar um tempo sem usar o painel. Entre de novo.</p>}
            {search.senha === "ok" && !msg && <p role="status" className="text-sm text-status-confirmed">Senha alterada. Entre com a senha nova.</p>}
            {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
            <Button type="submit" size="lg" className="h-12 w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
            <Button type="button" variant="link" className="h-auto w-full p-1 text-sm" onClick={() => { setForgot(true); setMsg(null); }}>Esqueci minha senha</Button>
            <p className="pt-2 text-center text-xs text-muted-foreground">Acesso só por convite. Peça ao gestor da sua unidade.</p>
          </form>
        )}
      </div>
    </main>
  );
}
