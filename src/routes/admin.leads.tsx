import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton, NativeSelect } from "@/components/admin/bits";
import { CITY_LABEL, LEAD_STATUS_CHIP, LEAD_STATUS_LABEL, ageLabel, countByStatus, isStale, type LeadRow, type LeadStatus } from "@/lib/leads";
import { formatPhoneE164, waLink } from "@/lib/reservations";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/leads")({
  head: () => ({ meta: [{ title: "Leads WhatsApp — Candeeiro Gestão" }, { name: "description", content: "Pessoas que chamaram pelo botão de WhatsApp do site." }, { property: "og:title", content: "Leads WhatsApp — Candeeiro Gestão" }, { property: "og:description", content: "Fila de atendimento dos leads do site." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Leads,
});

const FILTERS: (LeadStatus | "todos")[] = ["novo", "em_atendimento", "reservou", "perdido", "todos"];

function Leads() {
  const [rows, setRows] = useState<LeadRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeadStatus | "todos">("novo");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await requireSupabase().from("whatsapp_leads").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) { setErr(friendlyError(error)); return; }
    setErr(null);
    setRows((data ?? []) as LeadRow[]);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const inCity = useMemo(() => (rows ?? []).filter((r) => !city || r.city === city), [rows, city]);
  const counts = useMemo(() => countByStatus(inCity), [inCity]);
  const shown = inCity.filter((r) => filter === "todos" || r.status === filter);

  async function setStatus(r: LeadRow, status: LeadStatus) {
    setBusy(r.id);
    const { error } = await requireSupabase().rpc("whatsapp_lead_set_status", { _id: r.id, _status: status, _note: null });
    setBusy(null);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`Marcado como ${LEAD_STATUS_LABEL[status].toLowerCase()}`);
    void load();
  }

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-semibold sm:text-4xl">Leads do WhatsApp</h1>
      <p className="mt-1 text-sm text-muted-foreground">Quem tocou no botão de WhatsApp do site. Chame primeiro os novos.</p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-full bg-surface p-1" role="tablist" aria-label="Filtrar por status">
          {FILTERS.map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              className={cn("min-h-10 shrink-0 rounded-full px-4 text-sm transition", filter === f ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>
              {f === "todos" ? "Todos" : LEAD_STATUS_LABEL[f]} <span className="tabular-nums text-muted-foreground">{counts[f]}</span>
            </button>
          ))}
        </div>
        <NativeSelect aria-label="Cidade" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Todas as cidades</option>
          <option value="goiania">Goiânia</option>
          <option value="anapolis">Anápolis</option>
        </NativeSelect>
      </div>

      {err ? <ErrorState message={err} onRetry={() => void load()} /> : !rows ? <ListSkeleton /> : shown.length === 0 ? (
        <EmptyState icon={MessageCircle} title="Nenhum lead aqui" text={filter === "novo" ? "Quando alguém chamar pelo botão do site, aparece nesta fila." : "Mude o filtro para ver outros leads."} />
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((r) => (
            <li key={r.id} className={cn("min-w-0 rounded-3xl bg-card p-4 shadow-soft sm:p-5", isStale(r) && "ring-2 ring-status-pending")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{r.full_name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums"><Phone className="size-3.5" aria-hidden="true" />{formatPhoneE164(r.phone_e164)}</p>
                </div>
                <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", LEAD_STATUS_CHIP[r.status])}>{LEAD_STATUS_LABEL[r.status]}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {CITY_LABEL[r.city] ?? r.city} · {ageLabel(r.created_at)}{r.clicks > 1 ? ` · ${r.clicks} toques` : ""}{r.campaign ? ` · campanha ${r.campaign}` : ""}{r.utm?.["utm_source"] ? ` · ${r.utm["utm_source"]}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={waLink(r.phone_e164)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#168a45] px-4 text-sm font-semibold text-white">
                  <MessageCircle className="size-4" aria-hidden="true" /> Chamar no WhatsApp
                </a>
                {r.status === "novo" && <Button variant="outline" className="h-11 rounded-xl" disabled={busy === r.id} onClick={() => void setStatus(r, "em_atendimento")}>Em atendimento</Button>}
                {(r.status === "novo" || r.status === "em_atendimento") && (
                  <>
                    <Button variant="outline" className="h-11 rounded-xl" disabled={busy === r.id} onClick={() => void setStatus(r, "reservou")}>Reservou</Button>
                    <Button variant="ghost" className="h-11 rounded-xl text-muted-foreground" disabled={busy === r.id} onClick={() => void setStatus(r, "perdido")}>Perdido</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
