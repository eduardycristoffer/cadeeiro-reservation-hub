import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateLong, hhmm } from "@/lib/format";

const search = z.object({
  p: z.string().catch(""),
  u: z.string().catch(""),
  d: z.string().catch(""),
  t: z.string().catch(""),
  n: z.coerce.number().catch(0),
  s: z.string().catch("pendente"),
});

export const Route = createFileRoute("/reservar/sucesso")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Solicitação recebida — Rede Candeeiro" },
      { name: "description", content: "Acompanhe o protocolo da sua reserva na Rede Candeeiro." },
      { property: "og:title", content: "Solicitação recebida — Rede Candeeiro" },
      { property: "og:description", content: "Sua reserva foi registrada." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Success,
});

function Success() {
  const { p, u, d, t, n, s } = Route.useSearch();
  const confirmed = s === "confirmada";
  return (
    <main className="min-h-screen bg-surface px-5 py-16">
      <div className="fade-up mx-auto max-w-md rounded-3xl bg-card p-8 text-center shadow-soft">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {confirmed ? <Check className="h-7 w-7" /> : <Clock className="h-7 w-7" />}
        </div>
        <h1 className="mt-6 text-3xl font-semibold">
          {confirmed ? "Reserva confirmada" : "Solicitação recebida"}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {confirmed
            ? "Tudo certo. Esperamos você!"
            : "Sua reserva ainda depende de confirmação da unidade. Você será avisado pelo WhatsApp informado."}
        </p>
        <div className="mt-8 rounded-2xl bg-surface p-5 text-left">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Protocolo</p>
          <p className="mt-1 font-mono text-2xl font-semibold">{p}</p>
          <dl className="mt-5 space-y-3 text-sm">
            <Row k="Unidade" v={u} />
            {d && <Row k="Data" v={formatDateLong(d)} />}
            {t && <Row k="Horário" v={hhmm(t)} />}
            <Row k="Pessoas" v={String(n)} />
            <Row k="Status" v={confirmed ? "Confirmada" : "Aguardando confirmação"} />
          </dl>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">Guarde o protocolo para consultas.</p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/reservar">Fazer outra reserva</Link>
        </Button>
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium capitalize-first">{v}</dd>
    </div>
  );
}
