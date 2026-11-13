import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** A tela de alertas avisa o sino quando algo foi lido, para o número baixar na hora. */
export const ALERTS_CHANGED = "candeeiro:alerts-changed";

/** Quantos alertas não lidos a pessoa tem. `null` = recurso indisponível (ex.: banco ainda sem a migração) — o sino some. */
export function useUnreadAlerts(): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    let alive = true;
    const load = () => {
      void sb.rpc("notifications_unread_count" as never).then(({ data, error }) => {
        if (alive) setN(error || typeof data !== "number" ? null : data);
      });
    };
    load();
    const t = setInterval(load, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(ALERTS_CHANGED, load);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener(ALERTS_CHANGED, load); };
  }, []);
  return n;
}

export function AlertBell({ count, className = "" }: { count: number | null; className?: string }) {
  if (count === null) return null;
  return (
    <Link to="/admin/alertas" aria-label={count > 0 ? `Alertas: ${count} não lidos` : "Alertas"}
      className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-sidebar-accent ${className}`}>
      <Bell className="h-5 w-5" aria-hidden="true" />
      {count > 0 && (
        <span className="absolute right-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-brand-foreground">{count > 99 ? "99+" : count}</span>
      )}
    </Link>
  );
}
