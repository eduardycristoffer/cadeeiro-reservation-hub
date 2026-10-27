import { BrandLogo } from "@/components/BrandLogo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
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
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setMsg(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setMsg("E-mail ou senha inválidos.");
      navigate({ to: "/admin" });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + "/admin", data: { full_name: fullName } },
      });
      setLoading(false);
      if (error) return setMsg(error.message);
      if (data.session) navigate({ to: "/admin" });
      else setMsg("Conta criada. Confirme pelo link enviado ao seu e-mail.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5">
      <div className="fade-up w-full max-w-sm py-6 sm:rounded-3xl sm:bg-card sm:p-8 sm:shadow-soft">
        <BrandLogo className="h-16" />
        <h1 className="mt-2 text-2xl font-semibold">{mode === "login" ? "Entrar" : "Criar conta"}</h1>
        {!isSupabaseConfigured ? (
          <p className="mt-4 text-sm text-muted-foreground">O banco de dados ainda não foi conectado a este projeto.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            {mode === "signup" && (
              <Input required placeholder="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12 rounded-xl" />
            )}
            <Input required type="email" autoComplete="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl" />
            <Input required type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl" />
            {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")} className="h-11 w-full text-center text-sm text-muted-foreground">
              {mode === "login" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
