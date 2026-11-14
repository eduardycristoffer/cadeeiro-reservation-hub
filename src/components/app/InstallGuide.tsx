import { useState } from "react";
import { Check, Download, Monitor, Smartphone, Tablet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { installPlan, parseUserAgent, type Env, type InstallPlan } from "@/lib/app";
import { useInstall } from "@/lib/app-state";
import { cn } from "@/lib/utils";

/** Passo a passo numerado, com o número em destaque (lê bem no celular). */
export function Steps({ steps, className }: { steps: string[]; className?: string }) {
  return (
    <ol className={cn("space-y-3", className)}>
      {steps.map((s, i) => (
        <li key={s} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background" aria-hidden="true">{i + 1}</span>
          <span className="min-w-0 flex-1 pt-0.5 text-[15px] leading-snug"><span className="sr-only">Passo {i + 1}: </span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

const SAMPLE: Record<"iphone" | "android" | "computador", { label: string; icon: typeof Smartphone; env: Env }> = {
  iphone: { label: "iPhone", icon: Smartphone, env: parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1") },
  android: { label: "Android", icon: Tablet, env: parseUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/123.0.0.0 Mobile Safari/537.36") },
  computador: { label: "Computador", icon: Monitor, env: parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36") },
};

/** Passo a passo de qualquer aparelho, para quem está no computador e vai instalar em outro. */
export function OtherDevices({ className }: { className?: string }) {
  const [tab, setTab] = useState<keyof typeof SAMPLE>("iphone");
  const plan: InstallPlan = installPlan(SAMPLE[tab].env, { standalone: false, canPrompt: false });
  return (
    <div className={className}>
      <div role="tablist" aria-label="Escolha o aparelho" className="grid grid-cols-3 gap-1 rounded-full bg-surface p-1">
        {(Object.keys(SAMPLE) as (keyof typeof SAMPLE)[]).map((k) => {
          const Icon = SAMPLE[k].icon;
          return (
            <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn("flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm transition", tab === k ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>
              <Icon className="h-4 w-4" aria-hidden="true" />{SAMPLE[k].label}
            </button>
          );
        })}
      </div>
      <div className="mt-4" role="tabpanel"><Steps steps={plan.steps} /></div>
    </div>
  );
}

/**
 * O que a pessoa precisa fazer AGORA neste aparelho: botão de baixar (quando o navegador permite),
 * ou o passo a passo certo para o celular/navegador dela.
 */
export function InstallAction({ size = "xl", onInstalled }: { size?: "lg" | "xl"; onInstalled?: () => void }) {
  const { ready, plan, install, standalone } = useInstall();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!ready || !plan) return <div className="h-14 animate-pulse rounded-full bg-surface" aria-hidden="true" />;

  if (standalone || plan.mode === "installed" || done) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-status-confirmed-bg p-4 text-status-confirmed" role="status">
        <Check className="h-6 w-6 shrink-0" aria-hidden="true" />
        <p className="text-[15px] font-medium leading-snug">{done && !standalone ? "Pronto! Procure o ícone Candeeiro na tela do aparelho." : "App instalado neste aparelho."}</p>
      </div>
    );
  }

  if (plan.mode === "prompt") {
    return (
      <Button size={size} variant="brand" className="w-full" disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await install();
          setBusy(false);
          if (r === "accepted") { setDone(true); onInstalled?.(); }
          else if (r === "unavailable") toast.error("O navegador não abriu a instalação. Siga os passos abaixo.");
        }}>
        <Download className="!size-5" aria-hidden="true" /> {busy ? "Abrindo…" : "Baixar o app"}
      </Button>
    );
  }

  return (
    <div className="rounded-3xl bg-card p-5 shadow-soft">
      <h3 className="text-lg font-semibold leading-tight">{plan.title}</h3>
      {plan.note && <p className="mt-1.5 text-sm text-muted-foreground">{plan.note}</p>}
      <Steps steps={plan.steps} className="mt-4" />
    </div>
  );
}
