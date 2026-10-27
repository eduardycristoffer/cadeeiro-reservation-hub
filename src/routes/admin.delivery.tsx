import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPin, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/admin/bits";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { formatPhoneE164, waLink } from "@/lib/reservations";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/delivery")({
  head: () => ({ meta: [{ name: "description", content: "Gestão de pedidos de delivery da Rede Candeeiro." }, { property: "og:title", content: "Delivery — Candeeiro Gestão" }, { property: "og:description", content: "Gestão de pedidos de delivery da Rede Candeeiro." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Delivery — Candeeiro Gestão" }, { name: "robots", content: "noindex" }] }),
  component: Delivery,
});

type Status = "novo" | "em_preparo" | "saiu_para_entrega" | "entregue" | "cancelado";
type Order = {
  id: string; protocol: string; status: Status; items_text: string; address: string; neighborhood: string | null;
  address_reference: string | null; payment_method: string | null; change_for: number | null; notes: string | null; created_at: string;
  customers: { full_name: string; phone_e164: string } | null; units: { name: string } | null;
};

const STATUS_LABEL: Record<Status, string> = {
  novo: "Novo", em_preparo: "Em preparo", saiu_para_entrega: "Saiu para entrega", entregue: "Entregue", cancelado: "Cancelado",
};
const NEXT: Record<Status, { to: Status; label: string }[]> = {
  novo: [{ to: "em_preparo", label: "Iniciar preparo" }, { to: "cancelado", label: "Cancelar" }],
  em_preparo: [{ to: "saiu_para_entrega", label: "Saiu para entrega" }, { to: "cancelado", label: "Cancelar" }],
  saiu_para_entrega: [{ to: "entregue", label: "Marcar entregue" }, { to: "cancelado", label: "Cancelar" }],
  entregue: [], cancelado: [],
};
const PAYMENT: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", cartao_credito: "Cartão de crédito", cartao_debito: "Cartão de débito", outro: "Outro" };
const DOT: Record<Status, string> = { novo: "bg-warning", em_preparo: "bg-foreground", saiu_para_entrega: "bg-foreground", entregue: "bg-success", cancelado: "bg-muted-foreground/40" };

function Delivery() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [units, setUnits] = useState<{ id: string; name: string; has_delivery: boolean }[]>([]);
  const [unitId, setUnitId] = useState("");
  const [status, setStatus] = useState<"" | Status>("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = requireSupabase().from("delivery_orders")
      .select("id,protocol,status,items_text,address,neighborhood,address_reference,payment_method,change_for,notes,created_at,customers(full_name,phone_e164),units(name)")
      .order("created_at", { ascending: false }).limit(100);
    if (unitId) q = q.eq("unit_id", unitId);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) { toast.error(friendlyError(error)); setOrders([]); return; }
    setOrders((data ?? []) as unknown as Order[]);
  }, [unitId, status]);

  useEffect(() => {
    requireSupabase().from("units").select("id,name,has_delivery").order("sort_order").then(({ data }) => setUnits((data ?? []) as typeof units));
  }, []);
  useEffect(() => { setOrders(null); void load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  async function change(o: Order, to: Status) {
    if (to === "cancelado" && !window.confirm(`Cancelar o pedido ${o.protocol}?`)) return;
    setBusy(o.id);
    const { error } = await requireSupabase().rpc("set_delivery_status", { _order_id: o.id, _status: to });
    setBusy(null);
    if (error) toast.error(friendlyError(error)); else { toast.success(`${o.protocol}: ${STATUS_LABEL[to]}`); await load(); }
  }

  const anyDelivery = units.some((u) => u.has_delivery);

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Delivery</h1>
          <p className="mt-1 text-muted-foreground">Valor e prazo dependem da confirmação da equipe.</p>
        </div>
        <Button variant="outline" onClick={() => { setOrders(null); void load(); }}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <NativeSelect aria-label="Unidade" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">Todas as unidades</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.has_delivery ? "" : " (sem delivery)"}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as "" | Status)}>
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </NativeSelect>
      </div>

      {units.length > 0 && !anyDelivery && (
        <p className="mt-6 rounded-2xl bg-surface p-4 text-sm">
          Nenhuma unidade está com delivery ligado. Ative em <strong>Unidades</strong> &gt; a unidade &gt; "Faz delivery" para o atendente começar a registrar pedidos.
        </p>
      )}

      {!orders ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : orders.length === 0 ? (
        <p className="mt-8 text-center text-muted-foreground">Nenhum pedido encontrado.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((o) => (
            <article key={o.id} className="rounded-3xl bg-card p-5 shadow-soft">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs">{o.protocol}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-medium">
                  <span className={cn("h-1.5 w-1.5 rounded-full", DOT[o.status])} /> {STATUS_LABEL[o.status]}
                </span>
                <span className="text-xs text-muted-foreground">{o.units?.name} · {new Date(o.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
              </div>
              <p className="mt-3 text-lg font-semibold">{o.customers?.full_name ?? "Cliente"}
                {o.customers && <span className="ml-2 text-sm font-normal text-muted-foreground">{formatPhoneE164(o.customers.phone_e164)}</span>}
              </p>
              <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-surface p-3 text-sm">{o.items_text}</p>
              <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{o.address}{o.neighborhood ? ` · ${o.neighborhood}` : ""}{o.address_reference ? ` (ref.: ${o.address_reference})` : ""}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pagamento: {o.payment_method ? PAYMENT[o.payment_method] : "a combinar"}{o.change_for ? ` · troco para R$ ${Number(o.change_for).toFixed(2).replace(".", ",")}` : ""}
                {o.notes ? ` · Obs.: ${o.notes}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {NEXT[o.status].map((n) => (
                  <Button key={n.to} size="sm" variant={n.to === "cancelado" ? "outline" : "default"} disabled={busy === o.id} onClick={() => change(o, n.to)}>{n.label}</Button>
                ))}
                {o.customers && (
                  <Button asChild size="sm" variant="outline">
                    <a href={waLink(o.customers.phone_e164)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
