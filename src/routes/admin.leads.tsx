import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Download, MessageCircle, Phone, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, EmptyState, ErrorState, ListSkeleton } from "@/components/admin/bits";
import { CIDADES, OFERTA, type Cidade } from "@/lib/oferta";
import { downloadCsv, toCsvTable } from "@/lib/csv";
import { formatPhoneE164, waLink } from "@/lib/reservations";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["whatsapp_leads"]["Row"];
const STATUS = {
  novo: "Novo",
  chamado: "Chamado",
  convertido: "Convertido",
  perdido: "Perdido",
} as const;
export const Route = createFileRoute("/admin/leads")({
  head: () => ({
    meta: [
      { title: "Contatos WhatsApp — Candeeiro Gestão" },
      {
        name: "description",
        content: "Contatos capturados pelo botão de WhatsApp da Rede Candeeiro.",
      },
      { property: "og:title", content: "Contatos WhatsApp — Candeeiro Gestão" },
      { property: "og:description", content: "Acompanhamento de contatos por cidade e campanha." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Leads,
});
function Leads() {
  const [city, setCity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const query = useCallback(() => {
    let r = requireSupabase()
      .from("whatsapp_leads")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (city) r = r.eq("city", city);
    if (status) r = r.eq("status", status);
    if (from) r = r.gte("created_at", `${from}T00:00:00-03:00`);
    if (to) r = r.lte("created_at", `${to}T23:59:59.999-03:00`);
    const term = q.replace(/[^\p{L}\p{N}\s+]/gu, "").trim();
    if (term) r = r.or(`full_name.ilike.%${term}%,phone_e164.ilike.%${term}%`);
    return r;
  }, [city, status, from, to, q]);
  useEffect(() => {
    setPage(0);
  }, [city, from, to, status, q]);
  useEffect(() => {
    let alive = true;
    setError(null);
    setRows(null);
    const timer = setTimeout(() => {
      query()
        .range(page * 25, page * 25 + 24)
        .then(({ data, error, count }) => {
          if (!alive) return;
          if (error) setError(friendlyError(error));
          else {
            setRows(data);
            setCount(count ?? 0);
          }
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, page, tick]);
  async function change(id: string, value: string) {
    setBusy(id);
    const { error } = await requireSupabase().rpc("set_whatsapp_lead_status", {
      _id: id,
      _status: value,
    });
    setBusy(null);
    if (error) toast.error(friendlyError(error));
    else {
      toast.success("Status atualizado");
      setTick((n) => n + 1);
    }
  }
  async function exportCsv() {
    setBusy("export");
    try {
      const all: Lead[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await query().range(offset, offset + 499);
        if (error) throw error;
        all.push(...data);
        if (data.length < 500) break;
      }
      const { error } = await requireSupabase().rpc("log_whatsapp_leads_export", {
        _city: city || null,
      });
      if (error) throw error;
      downloadCsv(
        "contatos-whatsapp.csv",
        toCsvTable(
          [
            "Nome",
            "WhatsApp",
            "Cidade",
            "Origem",
            "Página",
            "UTM source",
            "UTM medium",
            "Campanha",
            "Conteúdo",
            "fbclid",
            "Data",
            "Status",
          ],
          all.map((r) => [
            r.full_name,
            r.phone_e164,
            OFERTA[r.city as Cidade].nome,
            r.origin,
            r.page_path,
            r.utm_source,
            r.utm_medium,
            r.utm_campaign,
            r.utm_content,
            r.fbclid,
            r.created_at,
            STATUS[r.status as keyof typeof STATUS],
          ]),
        ),
      );
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="fade-up">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Contatos</h1>
        <Button variant="outline" className="h-11" disabled={!!busy || !count} onClick={exportCsv}>
          <Download />
          CSV
        </Button>
      </div>
      <Input
        aria-label="Buscar nome ou WhatsApp"
        placeholder="Nome ou WhatsApp"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mt-5 h-12 bg-card"
      />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block text-xs font-medium text-muted-foreground">
          Cidade
          <NativeSelect className="mt-1 block w-full" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Todas</option>
            {CIDADES.map((c) => (
              <option key={c} value={c}>
                {OFERTA[c].nome}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Status
          <NativeSelect className="mt-1 block w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          De
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 h-11 bg-card"
          />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Até
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 h-11 bg-card"
          />
        </label>
      </div>
      <div className="mt-5">
        {error ? (
          <ErrorState message={error} onRetry={() => setTick((n) => n + 1)} />
        ) : !rows ? (
          <ListSkeleton />
        ) : !rows.length ? (
          <EmptyState
            icon={Users}
            title="Nenhum contato"
            text="Os contatos do botão WhatsApp aparecem aqui."
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {rows.map((r) => (
              <li key={r.id} className="min-w-0 rounded-3xl bg-card p-5 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold">{r.full_name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {OFERTA[r.city as Cidade].nome} · {formatPhoneE164(r.phone_e164)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  WhatsApp do site · {r.page_path}
                </p>
                {(r.utm_source || r.utm_campaign || r.utm_medium || r.utm_content || r.fbclid) && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer py-2">Origem e campanha</summary>
                    <dl className="space-y-1 break-all text-muted-foreground">
                      {[
                        ["Fonte", r.utm_source],
                        ["Meio", r.utm_medium],
                        ["Campanha", r.utm_campaign],
                        ["Conteúdo", r.utm_content],
                        ["fbclid", r.fbclid],
                      ].map(
                        ([k, v]) =>
                          v && (
                            <div key={k}>
                              <dt className="inline font-medium">{k}: </dt>
                              <dd className="inline">{v}</dd>
                            </div>
                          ),
                      )}
                    </dl>
                  </details>
                )}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Button asChild variant="outline" className="h-11 px-2">
                    <a href={`tel:${r.phone_e164}`}>
                      <Phone />
                      Ligar
                    </a>
                  </Button>
                  <Button asChild variant="outline" className="h-11 px-2">
                    <a
                      href={waLink(r.phone_e164)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`WhatsApp de ${r.full_name}`}
                    >
                      <MessageCircle />
                      <span className="sr-only">WhatsApp</span>
                    </a>
                  </Button>
                  <NativeSelect
                    aria-label={`Status de ${r.full_name}`}
                    value={r.status}
                    disabled={!!busy}
                    onChange={(e) => change(r.id, e.target.value)}
                  >
                    {Object.entries(STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!!count && (
        <div className="mt-5 flex items-center justify-between">
          <Button
            variant="outline"
            className="h-11"
            disabled={!page}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {Math.ceil(count / 25)}
          </span>
          <Button
            variant="outline"
            className="h-11"
            disabled={(page + 1) * 25 >= count}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
