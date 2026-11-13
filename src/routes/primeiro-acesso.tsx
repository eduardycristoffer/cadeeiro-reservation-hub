import { BrandLogo } from "@/components/BrandLogo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError, supabase } from "@/lib/supabase";
import { setFirstAccessPassword } from "@/lib/team.functions";
import { parseInviteParams } from "@/lib/invite-link";

export const Route = createFileRoute("/primeiro-acesso")({
  ssr: false,
  head: () => ({
    meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
      { title: "Primeiro acesso — Candeeiro Gestão" },
      { name: "description", content: "Defina seu nome e sua senha para acessar o painel Candeeiro." },
      { property: "og:title", content: "Primeiro acesso — Candeeiro Gestão" },
      { property: "og:description", content: "Defina seu nome e sua senha." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrimeiroAcesso,
});

function PrimeiroAcesso() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<"wait" | "ok" | "none">("wait");
  const [name, setName] = useState("");
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
      setName((data.user.user_metadata?.["full_name"] as string | undefined) ?? "");
      setReady("ok");
      return true;
    };
    const { data: sub } = sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" || ev === "INITIAL_SESSION") apply(); });
    // Link novo do e-mail: o token só é gasto aqui, quando a pessoa abre a página (leitores de e-mail não gastam o link).
    const tok = parseInviteParams(window.location.search);
    if (tok) {
      window.history.replaceState(null, "", window.location.pathname);
      sb.auth.verifyOtp({ token_hash: tok.tokenHash, type: tok.type }).then(({ error }) => { if (error) setReady("none"); else apply(); });
    } else apply();
    const t = setTimeout(() => { if (!done) setReady("none"); }, 4000);
    return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setMsg(null);
    if (name.trim().length < 2) return setMsg("Informe seu nome.");
    if (pw.length < 8) return setMsg("A senha precisa ter pelo menos 8 caracteres.");
    if (pw !== pw2) return setMsg("As senhas não conferem.");
    setBusy(true);
    const up = await setFirstAccessPassword({ data: { password: pw } }).catch(() => ({ ok: false as const, error: "Não foi possível salvar a senha. Tente de novo." }));
    if (!up.ok) { setBusy(false); return setMsg(up.error); }
    const done = await supabase.rpc("complete_first_access", { _full_name: name.trim() });
    if (done.error) { setBusy(false); return setMsg(friendlyError(done.error)); }
    await supabase.rpc("log_auth_event", { _action: "login" });
    setBusy(false);
    navigate({ to: "/admin" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5">
      <div className="fade-up w-full max-w-sm py-6 sm:rounded-3xl sm:bg-card sm:p-8 sm:shadow-soft">
        <BrandLogo className="h-16" />
        <h1 className="mt-2 text-2xl font-semibold">Primeiro acesso</h1>
        {ready === "wait" && <div className="mt-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        {ready === "none" && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">Link de convite inválido ou expirado. Peça um novo convite ao gestor.</p>
            <Button variant="outline" className="h-12 w-full" onClick={() => navigate({ to: "/entrar" })}>Ir para o login</Button>
          </div>
        )}
        {ready === "ok" && (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">Confirme seu nome e crie sua senha.</p>
            <div className="space-y-1.5"><Label htmlFor="fa-name">Seu nome</Label>
              <Input id="fa-name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl" /></div>
            <div className="space-y-1.5"><Label htmlFor="fa-pw">Nova senha</Label>
              <Input id="fa-pw" required type="password" minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-12 rounded-xl" /></div>
            <div className="space-y-1.5"><Label htmlFor="fa-pw2">Repita a senha</Label>
              <Input id="fa-pw2" required type="password" minLength={8} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="h-12 rounded-xl" /></div>
            {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
            <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar e entrar"}</Button>
          </form>
        )}
      </div>
    </main>
  );
}
