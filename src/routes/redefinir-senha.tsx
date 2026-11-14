import { BrandLogo } from "@/components/BrandLogo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseInviteParams } from "@/lib/invite-link";
import { friendlyError, supabase } from "@/lib/supabase";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
      { title: "Redefinir senha — Candeeiro Gestão" },
      { name: "description", content: "Crie uma senha nova para o painel Candeeiro Gestão." },
      { property: "og:title", content: "Redefinir senha — Candeeiro Gestão" },
      { property: "og:description", content: "Crie uma senha nova para o painel." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RedefinirSenha,
});

function RedefinirSenha() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<"wait" | "ok" | "none">("wait");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return setReady("none");
    const sb = supabase;
    let done = false;
    const apply = async () => {
      const { data } = await sb.auth.getUser();
      if (!data.user) return false;
      done = true;
      setReady("ok");
      return true;
    };
    const { data: sub } = sb.auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY" || ev === "SIGNED_IN") void apply(); });
    // O token só é gasto aqui, quando a pessoa abre a página (leitores de e-mail não gastam o link).
    const tok = parseInviteParams(window.location.search);
    if (tok) {
      window.history.replaceState(null, "", window.location.pathname);
      void sb.auth.verifyOtp({ token_hash: tok.tokenHash, type: tok.type }).then(({ error }) => { if (error) setReady("none"); else void apply(); });
    } else void apply();
    const t = setTimeout(() => { if (!done) setReady("none"); }, 4000);
    return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setMsg(null);
    if (pw.length < 8) return setMsg("A senha precisa ter pelo menos 8 caracteres.");
    if (pw !== pw2) return setMsg("As senhas não conferem.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setBusy(false);
      return setMsg(/weak|pwned|leaked/i.test(error.message) ? "Senha fraca ou já vazada na internet. Escolha outra." : /same/i.test(error.message) ? "Escolha uma senha diferente da anterior." : friendlyError(error));
    }
    await supabase.rpc("log_password_change" as never, { _via: "redefinicao" } as never);
    await supabase.auth.signOut();
    setBusy(false);
    navigate({ to: "/entrar", search: { senha: "ok" } });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5">
      <div className="fade-up w-full max-w-sm py-6 sm:rounded-3xl sm:bg-card sm:p-8 sm:shadow-soft">
        <BrandLogo className="h-16" />
        <h1 className="mt-2 text-2xl font-semibold">Redefinir senha</h1>
        {ready === "wait" && <div className="mt-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando" /></div>}
        {ready === "none" && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">Este link venceu ou já foi usado. Peça um novo na tela de entrada, em “Esqueci minha senha”.</p>
            <Button asChild variant="outline" className="h-12 w-full"><Link to="/entrar">Ir para o login</Link></Button>
          </div>
        )}
        {ready === "ok" && (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">Crie uma senha nova com pelo menos 8 caracteres.</p>
            <div className="space-y-1.5"><Label htmlFor="rs-pw">Nova senha</Label>
              <Input id="rs-pw" required type="password" minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-12 rounded-xl" /></div>
            <div className="space-y-1.5"><Label htmlFor="rs-pw2">Repita a senha</Label>
              <Input id="rs-pw2" required type="password" minLength={8} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="h-12 rounded-xl" /></div>
            {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
            <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar senha"}</Button>
          </form>
        )}
      </div>
    </main>
  );
}
