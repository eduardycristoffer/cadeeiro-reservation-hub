import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ALERT_KINDS } from "@/lib/email";
import { maskBrPhone } from "@/lib/format";
import { useScope } from "@/lib/scope-context";
import { ROLE_LABEL } from "@/lib/audit";
import { signOutLogged, useAuth } from "@/lib/auth";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { formatPhoneE164 } from "@/lib/reservations";
import { TwoFactorCard } from "@/components/admin/TwoFactorCard";

export const Route = createFileRoute("/admin/perfil")({
  head: () => ({ meta: [{ title: "Meu perfil — Candeeiro Gestão" }, { name: "description", content: "Seus dados, os alertas que você recebe e sua senha no painel Candeeiro." }, { property: "og:title", content: "Meu perfil — Candeeiro Gestão" }, { property: "og:description", content: "Seu nome, sua senha e sua sessão." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
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
  const { scope } = useScope();
  const isManager = roles.includes("super_admin") || roles.includes("gestor");
  const [phone, setPhone] = useState("");
  const [phoneLoaded, setPhoneLoaded] = useState("");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [muted, setMuted] = useState<string[]>([]);
  const [prefsReady, setPrefsReady] = useState<"wait" | "ok" | "none">("wait");
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void requireSupabase().from("user_profiles").select("phone").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (!alive) return;
      const p = (data as { phone?: string | null } | null)?.phone ?? "";
      const shown = p ? maskBrPhone(p.replace(/^55/, "")) : "";
      setPhone(shown); setPhoneLoaded(shown);
    });
    void requireSupabase().rpc("notification_prefs_get" as never).then(({ data, error }) => {
      if (!alive) return;
      const d = data as { email_alerts?: boolean; muted_kinds?: string[] } | null;
      if (error || !d) return setPrefsReady("none");
      setEmailAlerts(d.email_alerts !== false); setMuted(Array.isArray(d.muted_kinds) ? d.muted_kinds : []); setPrefsReady("ok");
    });
    return () => { alive = false; };
  }, [user]);
  const kinds = ALERT_KINDS.filter((k) => isManager || (k.id !== "grupo_grande" && k.id !== "falha_envio"));
  async function savePrefs(nextEmail: boolean, nextMuted: string[]) {
    const prev = { emailAlerts, muted };
    setEmailAlerts(nextEmail); setMuted(nextMuted);
    const { error } = await requireSupabase().rpc("notification_prefs_set" as never, { _email_alerts: nextEmail, _muted_kinds: nextMuted } as never);
    if (error) { setEmailAlerts(prev.emailAlerts); setMuted(prev.muted); toast.error(friendlyError(error)); return; }
    toast.success("Preferência salva");
  }

  async function saveName(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!user || name.trim().length < 2) return;
    setSavingName(true);
    const { error } = await requireSupabase().rpc("profile_update" as never, { _full_name: name.trim(), _phone: phone.replace(/\D/g, "") ? phone : null } as never);
    setSavingName(false);
    if (error) { toast.error(friendlyError(error)); return; }
    setPhoneLoaded(phone);
    toast.success("Dados atualizados");
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
    void requireSupabase().rpc("log_password_change" as never, { _via: "perfil" } as never);
    toast.success("Senha alterada");
  }

  return (
    <div className="fade-up mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold sm:text-4xl">Meu perfil</h1>
      <p className="mt-1 truncate text-sm text-muted-foreground">{user?.email} · {roles.map((r) => ROLE_LABEL[r]).join(", ")}</p>

      <form onSubmit={saveName} className="mt-6 space-y-3 rounded-3xl bg-card p-5 shadow-soft">
        <h2 className="font-semibold">Seus dados</h2>
        <div className="space-y-1.5"><Label htmlFor="pf-name">Nome</Label>
          <Input id="pf-name" required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl" /></div>
        <div className="space-y-1.5"><Label htmlFor="pf-phone">WhatsApp / telefone <span className="font-normal text-muted-foreground">(opcional)</span></Label>
          <Input id="pf-phone" inputMode="tel" autoComplete="tel" placeholder="(62) 99999-0000" value={phone} onChange={(e) => setPhone(maskBrPhone(e.target.value))} className="h-12 rounded-xl" /></div>
        <div className="space-y-1.5"><Label htmlFor="pf-email">E-mail de acesso</Label>
          <Input id="pf-email" readOnly disabled value={user?.email ?? ""} className="h-12 rounded-xl" />
          <p className="text-xs text-muted-foreground">Para trocar o e-mail de acesso, peça a um admin.</p></div>
        {scope && scope.units.length > 0 && <p className="text-xs text-muted-foreground">Unidades com acesso: {scope.units.map((u) => u.name).join(", ")}</p>}
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={savingName || (name.trim() === (fullName ?? "") && phone === phoneLoaded)}>
          {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar dados"}
        </Button>
        {phoneLoaded && <span className="sr-only">Telefone salvo: {formatPhoneE164(phoneLoaded)}</span>}
      </form>

      {prefsReady !== "none" && (
        <section aria-labelledby="pf-alerts" className="mt-4 space-y-1 rounded-3xl bg-card p-5 shadow-soft">
          <h2 id="pf-alerts" className="font-semibold">Alertas que você recebe</h2>
          <p className="pb-2 text-sm text-muted-foreground">Desligue o que não precisa. Vale para o sino do painel e para o e-mail.</p>
          <div className="flex items-center justify-between gap-4 border-b py-3">
            <Label htmlFor="pf-email-alerts" className="min-w-0 flex-1 text-sm"><span className="block font-medium">Receber alertas por e-mail</span><span className="block text-xs font-normal text-muted-foreground">Desligado, você vê só no sino.</span></Label>
            <Switch id="pf-email-alerts" checked={emailAlerts} disabled={prefsReady !== "ok"} onCheckedChange={(v) => void savePrefs(v, muted)} />
          </div>
          {kinds.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-4 py-3">
              <Label htmlFor={`pf-k-${k.id}`} className="min-w-0 flex-1 text-sm"><span className="block font-medium">{k.label}</span><span className="block text-xs font-normal text-muted-foreground">{k.hint}</span></Label>
              <Switch id={`pf-k-${k.id}`} checked={!muted.includes(k.id)} disabled={prefsReady !== "ok"} onCheckedChange={(v) => void savePrefs(emailAlerts, v ? muted.filter((m) => m !== k.id) : [...muted, k.id])} />
            </div>
          ))}
        </section>
      )}

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

      <TwoFactorCard />

      <Button variant="outline" className="mt-4 h-12 w-full" onClick={() => signOutLogged()}><LogOut className="h-4 w-4" /> Sair</Button>
    </div>
  );
}
