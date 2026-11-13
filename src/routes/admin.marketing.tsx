import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState, ListSkeleton, NativeSelect } from "@/components/admin/bits";
import { useAuth } from "@/lib/auth";
import { isValidPixelId } from "@/lib/pixel";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/marketing")({
  head: () => ({ meta: [{ title: "Marketing — Candeeiro Gestão" }, { name: "description", content: "Pixels da Meta e ticket médio." }, { property: "og:title", content: "Marketing — Candeeiro Gestão" }, { property: "og:description", content: "Pixels e ticket médio." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Marketing,
});

type Tab = "pixels" | "ticket";

function Marketing() {
  const { roles } = useAuth();
  const allowed = roles.includes("super_admin") || roles.includes("gestor");
  const [tab, setTab] = useState<Tab>("pixels");
  if (!allowed) return <ErrorState message="Só gestores acessam esta área." />;
  return (
    <div className="fade-up">
      <h1 className="text-2xl font-semibold sm:text-4xl">Marketing</h1>
      <p className="mt-1 text-sm text-muted-foreground">Pixels da Meta e o ticket médio usado nos relatórios de anúncios.</p>
      <div className="mt-5 inline-flex gap-1 rounded-full bg-surface p-1" role="tablist">
        {([["pixels", "Pixels da Meta"], ["ticket", "Ticket médio"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("min-h-10 rounded-full px-4 text-sm transition", tab === k ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}>{label}</button>
        ))}
      </div>
      <div className="mt-5">{tab === "pixels" ? <Pixels /> : <TicketMedio />}</div>
    </div>
  );
}

type Pixel = { id: string; name: string; pixel_id: string; scope: "global" | "goiania" | "anapolis" | "campanha"; campaign_slug: string | null; is_active: boolean; notes: string | null };
const SCOPE_LABEL: Record<Pixel["scope"], string> = { global: "Site todo", goiania: "Só Goiânia", anapolis: "Só Anápolis", campanha: "Uma campanha" };

function Pixels() {
  const [rows, setRows] = useState<Pixel[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [scope, setScope] = useState<Pixel["scope"]>("global");
  const [campaign, setCampaign] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await requireSupabase().from("meta_pixels").select("*").order("created_at");
    if (error) { setErr(friendlyError(error)); return; }
    setErr(null); setRows((data ?? []) as Pixel[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const idOk = isValidPixelId(pixelId.trim());
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!idOk || name.trim().length < 2) return;
    setSaving(true);
    const { error } = await requireSupabase().rpc("pixel_save", { _id: null, _name: name.trim(), _pixel_id: pixelId.trim(), _scope: scope, _campaign_slug: scope === "campanha" ? campaign.trim() : null, _is_active: true, _notes: null });
    setSaving(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Pixel cadastrado");
    setName(""); setPixelId(""); setCampaign("");
    void load();
  }
  async function toggle(p: Pixel, on: boolean) {
    const { error } = await requireSupabase().rpc("pixel_save", { _id: p.id, _name: p.name, _pixel_id: p.pixel_id, _scope: p.scope, _campaign_slug: p.campaign_slug, _is_active: on, _notes: p.notes });
    if (error) { toast.error(friendlyError(error)); return; }
    void load();
  }
  async function remove(p: Pixel) {
    if (!window.confirm(`Remover o pixel "${p.name}"?`)) return;
    const { error } = await requireSupabase().rpc("pixel_delete", { _id: p.id });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Pixel removido");
    void load();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={add} className="space-y-3 rounded-3xl bg-card p-5 shadow-soft">
        <h2 className="text-lg font-semibold">Novo pixel</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="px-name">Nome (para você)</Label><Input id="px-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Pixel Anápolis" className="mt-1.5 h-12 rounded-xl" /></div>
          <div><Label htmlFor="px-id">ID do pixel</Label><Input id="px-id" value={pixelId} onChange={(e) => setPixelId(e.target.value.replace(/\D/g, "").slice(0, 20))} inputMode="numeric" placeholder="Só números" className="mt-1.5 h-12 rounded-xl tabular-nums" />
            {pixelId && !idOk && <p className="mt-1 text-sm text-destructive">O ID tem de 6 a 20 números.</p>}</div>
          <div><Label htmlFor="px-scope">Onde vale</Label>
            <NativeSelect id="px-scope" value={scope} onChange={(e) => setScope(e.target.value as Pixel["scope"])} className="mt-1.5 h-12 w-full">
              {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect></div>
          {scope === "campanha" && <div><Label htmlFor="px-camp">Campanha (o texto do ?campanha= do link)</Label><Input id="px-camp" value={campaign} onChange={(e) => setCampaign(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 60))} placeholder="black-friday" className="mt-1.5 h-12 rounded-xl" /></div>}
        </div>
        <Button type="submit" disabled={saving || !idOk || name.trim().length < 2 || (scope === "campanha" && !campaign)} className="h-11 rounded-xl">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4" /> Cadastrar pixel</>}
        </Button>
        <p className="text-xs text-muted-foreground">O pixel só carrega para quem aceitar os cookies. Eventos enviados: visita, interesse, início de reserva, contato por WhatsApp e reserva feita. Nenhum nome ou telefone vai para a Meta.</p>
      </form>

      {err ? <ErrorState message={err} onRetry={() => void load()} /> : !rows ? <ListSkeleton rows={2} /> : rows.length === 0 ? (
        <EmptyState title="Nenhum pixel ainda" text="Cadastre o pixel da Meta acima. Você pode ter um por cidade ou por campanha." />
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-3xl bg-card p-4 shadow-soft">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="text-sm text-muted-foreground tabular-nums">{p.pixel_id} · {SCOPE_LABEL[p.scope]}{p.campaign_slug ? ` (${p.campaign_slug})` : ""}</p>
              </div>
              <Switch checked={p.is_active} onCheckedChange={(v) => void toggle(p, v)} aria-label={`Pixel ${p.name} ativo`} />
              <Button variant="ghost" size="icon" className="size-11 text-muted-foreground" aria-label={`Remover ${p.name}`} onClick={() => void remove(p)}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TicketMedio() {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ticket, setTicket] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    requireSupabase().from("site_settings").select("quilo_avg_ticket").maybeSingle().then(({ data, error }) => {
      if (error) { setErr(friendlyError(error)); return; }
      if (data?.quilo_avg_ticket != null) setTicket(String(data.quilo_avg_ticket).replace(".", ","));
      setLoaded(true);
    });
  }, []);

  const invalid = ticket.trim() !== "" && !Number.isFinite(Number(ticket.replace(",", ".")));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await requireSupabase().rpc("site_settings_save", { _quilo_avg_ticket: ticket.trim() ? Number(ticket.replace(",", ".")) : null } as never);
    setSaving(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Ticket médio salvo");
  }

  if (err) return <ErrorState message={err} />;
  if (!loaded) return <ListSkeleton rows={2} />;
  return (
    <form onSubmit={save} className="space-y-4 rounded-3xl bg-card p-5 shadow-soft">
      <div>
        <Label htmlFor="wa-ticket">Ticket médio por pessoa no almoço por quilo (R$)</Label>
        <Input id="wa-ticket" value={ticket} inputMode="decimal" onChange={(e) => setTicket(e.target.value.replace(/[^\d,.]/g, "").slice(0, 7))} placeholder="Ex.: 45,00" className="mt-1.5 h-12 max-w-48 rounded-xl tabular-nums" />
        <p className="mt-1 text-xs text-muted-foreground">O quilo é vendido por peso, então o relatório de anúncios usa este valor para estimar o faturamento. Rodízios usam a tabela de Valores.</p>
      </div>
      <p className="text-xs text-muted-foreground">O WhatsApp de cada cidade (Goiânia e Anápolis) é editado em Integrações → WhatsApp.</p>
      <Button type="submit" disabled={saving || invalid} className="h-11 rounded-xl">{saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}</Button>
    </form>
  );
}
