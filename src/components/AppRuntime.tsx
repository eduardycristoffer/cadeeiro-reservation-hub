import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { startApp, syncPushOnOpen } from "@/lib/app-state";
import { ALERTS_CHANGED } from "@/lib/use-alerts";

/** Liga o app (service worker + convite de instalação) e trata o que o service worker avisa à tela. Não desenha nada. */
export function AppRuntime() {
  const router = useRouter();
  useEffect(() => {
    startApp();
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: unknown; silent?: boolean; data?: { title?: string; body?: string; url?: string } } | null;
      if (!d || typeof d !== "object") return;
      if (d.type === "navigate" && typeof d.url === "string" && /^\/[A-Za-z0-9/_?=&.-]*$/.test(d.url)) router.history.push(d.url);
      else if (d.type === "push") {
        window.dispatchEvent(new Event(ALERTS_CHANGED)); // o número do sino acompanha na hora
        if (!d.silent && d.data?.title) {
          const url = d.data.url && /^\/admin/.test(d.data.url) ? d.data.url : "/admin/alertas";
          toast(d.data.title, { description: d.data.body || undefined, duration: 9000, action: { label: "Abrir", onClick: () => router.history.push(url) } });
        }
      } else if (d.type === "resubscribe") void syncPushOnOpen();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
  return null;
}
