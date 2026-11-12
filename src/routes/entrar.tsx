import { BrandLogo } from "@/components/BrandLogo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { logBlockedLogin } from "@/lib/auth-log.functions";

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
  component: Entrar,
});

function Entrar() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    const { data: allowed } = await supabase.rpc("log_auth_event", { _action: "login" });
    if (allowed === false) {
      await supabase.auth.signOut();
      setLoading(false);
      return setMsg("Seu acesso está desativado ou ainda não foi liberado. Fale com o gestor da unidade.");
    }
    setLoading(false);
    navigate({ to: "/admin" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5">
      <div className="fade-up w-full max-w-sm py-6 sm:rounded-3xl sm:bg-card sm:p-8 sm:shadow-soft">
        <BrandLogo className="h-16" />
        <h1 className="mt-2 text-2xl font-semibold">Entrar</h1>
        {!isSupabaseConfigured ? (
          <p className="mt-4 text-sm text-muted-foreground">O banco de dados ainda não foi conectado a este projeto.</p>
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
            {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
            <Button type="submit" size="lg" className="h-12 w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
            <p className="pt-2 text-center text-xs text-muted-foreground">Acesso só por convite. Peça ao gestor da sua unidade.</p>
          </form>
        )}
      </div>
    </main>
  );
}
