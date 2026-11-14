import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { useInstall } from "@/lib/app-state";

const KEY = "candeeiro.app.banner";
const DAYS = 14;

/** Faixa discreta no celular convidando a instalar o app. Some por 14 dias ao dispensar e nunca aparece no app já instalado. */
export function InstallBanner() {
  const { ready, env, standalone, plan } = useInstall();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { const t = Number(window.localStorage.getItem(KEY) ?? 0); setHidden(Date.now() - t < DAYS * 86_400_000); } catch { setHidden(false); }
  }, []);
  if (!ready || hidden || standalone || !env?.mobile || plan?.mode === "unsupported") return null;
  const dismiss = () => { setHidden(true); try { window.localStorage.setItem(KEY, String(Date.now())); } catch { /* sem armazenamento */ } };
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface p-3 pl-4 md:hidden" role="region" aria-label="Instalar o app">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Smartphone className="h-5 w-5" aria-hidden="true" /></span>
      <Link to="/admin/app" className="min-w-0 flex-1 leading-tight">
        <span className="block text-sm font-semibold">Instale o app</span>
        <span className="block text-xs text-muted-foreground">Alertas no popup, mesmo com o app fechado</span>
      </Link>
      <button type="button" onClick={dismiss} aria-label="Dispensar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-background"><X className="h-4 w-4" /></button>
    </div>
  );
}
