import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL } from "@/lib/audit";
import { signOutLogged, useAuth } from "@/lib/auth";
import { friendlyError, requireSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/perfil")({
  head: () => ({ meta: [{ title: "Meu perfil — Candeeiro Gestão" }, { name: "description", content: "Seu nome, sua senha e sua sessão no painel Candeeiro." }, { property: "og:title", content: "Meu perfil — Candeeiro Gestão" }, { property: "og:description", content: "Seu nome, sua senha e sua sessão." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Perfil,
});

function Perfil() {
  const { user, roles, fullName, reload } = useAuth();
  const [name, setName] = useState(fullName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  useEffect(() => setName(fullName ?? ""), [fullName]);

  async function saveName(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!user || name.trim().length < 2) return;
    setSavingName(true);
    const { error } = await requireSupabase().from("user_profiles").update({ full_name: name.trim() }).eq("id", user.id);
    setSavingName(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Nome atualizado");
    reload();
  }

  async function savePw(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (pw.length < 8) return setPwMsg("A nova senha precisa ter pelo menos 8 caracteres.");
    if (pw !== pw2) return setPwMsg("As senhas não conferem.");
    setSavingPw(true);
    const { error } = await requireSupabase().auth.updateUser({ password: pw, current_password: cur } as { password: string });
    setSavingPw(false);
    if (error) return setPwMsg(/current|incorrect|invalid/i.test(error.message) ? "Senha atual incorreta." : /weak|pwned|leaked/i.test(error.message) ? "Senha fraca ou já vazada na internet. Escolha outra." : friendlyError(error));
    setCur(""); setPw(""); setPw2("");
    toast.success("Senha alterada");
  }

  return (
    <div className="fade-up mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold sm:text-4xl">Meu perfil</h1>
      <p className="mt-1 truncate text-sm text-muted-foreground">{user?.email} · {roles.map((r) => ROLE_LABEL[r]).join(", ")}</p>

      <form onSubmit={saveName} className="mt-6 space-y-3 rounded-3xl bg-card p-5 shadow-soft">
        <Label htmlFor="pf-name">Nome</Label>
        <Input id="pf-name" required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl" />
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={savingName || name.trim() === (fullName ?? "")}>
          {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar nome"}
        </Button>
      </form>

      <form onSubmit={savePw} className="mt-4 space-y-3 rounded-3xl bg-card p-5 shadow-soft">
        <h2 className="font-semibold">Trocar senha</h2>
        <div className="space-y-1.5"><Label htmlFor="pf-cur">Senha atual</Label>
          <Input id="pf-cur" required type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className="h-12 rounded-xl" /></div>
        <div className="space-y-1.5"><Label htmlFor="pf-pw">Nova senha</Label>
          <Input id="pf-pw" required type="password" minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-12 rounded-xl" /></div>
        <div className="space-y-1.5"><Label htmlFor="pf-pw2">Repita a nova senha</Label>
          <Input id="pf-pw2" required type="password" minLength={8} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="h-12 rounded-xl" /></div>
        {pwMsg && <p role="alert" className="text-sm text-destructive">{pwMsg}</p>}
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={savingPw}>{savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : "Trocar senha"}</Button>
      </form>

      <Button variant="outline" className="mt-4 h-12 w-full" onClick={() => signOutLogged()}><LogOut className="h-4 w-4" /> Sair</Button>
    </div>
  );
}
