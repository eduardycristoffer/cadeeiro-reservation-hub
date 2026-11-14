import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { signOutLogged } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { ACTIVITY_KEY, IDLE_LIMIT_MS, idleState, secondsLeft } from "@/lib/idle";

function readLast(): number | null {
  try { const v = localStorage.getItem(ACTIVITY_KEY); return v ? Number(v) : null; } catch { return null; }
}
function writeLast(t: number) {
  try { localStorage.setItem(ACTIVITY_KEY, String(t)); } catch { /* sem storage: vale só esta aba */ }
}

/**
 * Guarda da sessão do painel:
 *  1. Inatividade: sem mexer por 30 min a pessoa sai (aviso no último minuto). Vale entre abas e ao voltar
 *     de um celular/computador que ficou bloqueado, e não depende de timer estar rodando.
 *  2. 2FA: se a conta tem 2FA ligado e esta sessão só passou pela senha, volta para o login pedir o código.
 */
export function SessionGuard() {
  const navigate = useNavigate();
  const [left, setLeft] = useState<number | null>(null);
  const memo = useRef<number>(Date.now());

  const leave = useCallback(async (why: "inatividade" | "2fa") => {
    try { localStorage.removeItem(ACTIVITY_KEY); } catch { /* ok */ }
    if (why === "2fa") await supabase?.auth.signOut(); else await signOutLogged();
    navigate({ to: "/entrar", search: why === "inatividade" ? { motivo: "inatividade" } : {} });
  }, [navigate]);

  // 2FA ligado mas sessão só com senha (ex.: abriu /admin direto no endereço)
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") void leave("2fa");
    });
  }, [leave]);

  useEffect(() => {
    const now = Date.now();
    const prev = readLast();
    // voltou depois de muito tempo (aba/app fechado): vale o último movimento gravado
    if (prev === null || idleState(prev, now) !== "expirado") { writeLast(now); memo.current = now; }

    let lastWrite = now;
    const touch = () => {
      const t = Date.now();
      memo.current = t;
      setLeft((l) => (l === null ? l : null)); // mexeu: fecha o aviso
      if (t - lastWrite > 4_000) { lastWrite = t; writeLast(t); }
    };
    const check = () => {
      const last = readLast() ?? memo.current;
      const t = Date.now();
      const st = idleState(last, t);
      if (st === "expirado") void leave("inatividade");
      else setLeft(st === "aviso" ? secondsLeft(last, t) : null);
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    // o aviso não fecha com qualquer movimento do mouse: só com clique/toque/tecla, para a pessoa notar
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", check);
    const id = window.setInterval(check, 5_000);
    check();
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", check);
      window.clearInterval(id);
    };
  }, [leave]);

  // contagem regressiva a cada segundo só enquanto o aviso está aberto
  useEffect(() => {
    if (left === null) return;
    const id = window.setInterval(() => {
      const last = readLast() ?? memo.current;
      const t = Date.now();
      if (idleState(last, t) === "expirado") void leave("inatividade");
      else setLeft(idleState(last, t) === "aviso" ? secondsLeft(last, t) : null);
    }, 1_000);
    return () => window.clearInterval(id);
  }, [left === null, leave]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AlertDialog open={left !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Você ainda está aí?</AlertDialogTitle>
          <AlertDialogDescription>
            Por segurança, o painel sai sozinho depois de {Math.round(IDLE_LIMIT_MS / 60_000)} minutos sem uso. Você será desconectado em {left ?? 0}s.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-11" onClick={() => void leave("inatividade")}>Sair agora</Button>
          <Button className="h-11" onClick={() => { const t = Date.now(); memo.current = t; writeLast(t); setLeft(null); }}>Continuar conectado</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
