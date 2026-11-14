import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState, ListSkeleton, NativeSelect } from "@/components/admin/bits";
import { UTM_SOURCES, campaignUrl, isValidSlug, slugify } from "@/lib/ads";
import { useAuth } from "@/lib/auth";
import { servicesForCity } from "@/lib/reserva";
import { SERVICE_LABEL, type ServiceId } from "@/lib/reservations";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas — Candeeiro Gestão" }, { name: "description", content: "Páginas de campanha e links rastreados para anúncios." }, { property: "og:title", content: "Campanhas — Candeeiro Gestão" }, { property: "og:description", content: "Páginas e links de campanha." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Campanhas,
});

type Page = {
  id: string; slug: string; name: string; kind: "reserva" | "whatsapp"; headline: string; subheadline: string | null;
  city: "goiania" | "anapolis" | null; service: ServiceId | null; campaign: string; cta_label: string; thank_you: string | null; is_active: boolean;
};
type Draft = {
  id: string | null; name: string; slug: string; slugTouched: boolean; kind: Page["kind"]; headline: string; subheadline: string;
  city: string; service: string; campaign: string; cta: string; thanks: string; active: boolean;
};
const EMPTY: Draft = { id: null, name: "", slug: "", slugTouched: false, kind: "reserva", headline: "Reserve sua mesa", subheadline: "", city: "", service: "", campaign: "", cta: "Reservar agora", thanks: "", active: true };
const CITY_LABEL = { goiania: "Goiânia", anapolis: "Anápolis" } as const;

function Campanhas() {
  const { roles } = useAuth();
  const allowed = roles.includes("super_admin") || roles.includes("gestor");
  const [rows, setRows] = useState<Page[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await requireSupabase().from("campaign_pages").select("*").order("created_at", { ascending: false });
    if (error) { setErr(friendlyError(error)); return; }
    setErr(null); setRows((data ?? []) as Page[]);
  }, []);
  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  if (!allowed) return <ErrorState message="Só admins acessam as campanhas." />;

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-4xl">Campanhas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Crie uma página para cada anúncio e use o link rastreado: o sistema mostra quantas reservas e leads cada campanha trouxe.</p>
        </div>
        {!draft && <Button className="h-11 rounded-xl" onClick={() => setDraft({ ...EMPTY })}><Plus className="size-4" /> Nova campanha</Button>}
      </div>

      {draft && <Editor draft={draft} setDraft={setDraft} onSaved={() => { setDraft(null); void load(); }} />}

      <div className="mt-5">
        {err ? <ErrorState message={err} onRetry={() => void load()} /> : !rows ? <ListSkeleton rows={2} /> : rows.length === 0 ? (
          <EmptyState title="Nenhuma campanha ainda" text="Crie a primeira: escolha cidade e rodízio, escreva a chamada do anúncio e copie o link." />
        ) : (
          <ul className="space-y-3">{rows.map((p) => <Row key={p.id} p={p} onEdit={() => setDraft(toDraft(p))} onChanged={() => void load()} />)}</ul>
        )}
      </div>
    </div>
  );
}

function toDraft(p: Page): Draft {
  return { id: p.id, name: p.name, slug: p.slug, slugTouched: true, kind: p.kind, headline: p.headline, subheadline: p.subheadline ?? "", city: p.city ?? "", service: p.service ?? "", campaign: p.campaign === p.slug ? "" : p.campaign, cta: p.cta_label, thanks: p.thank_you ?? "", active: p.is_active };
}

function Editor({ draft, setDraft, onSaved }: { draft: Draft; setDraft: (d: Draft | null) => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const slugOk = isValidSlug(draft.slug);
  const services = draft.city ? servicesForCity(draft.city) : (Object.keys(SERVICE_LABEL) as ServiceId[]);
  const valid = slugOk && draft.name.trim().length >= 2 && draft.headline.trim().length >= 2 && draft.cta.trim().length >= 2;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const { error } = await requireSupabase().rpc("campaign_page_save", {
      _id: draft.id, _slug: draft.slug, _name: draft.name.trim(), _kind: draft.kind, _headline: draft.headline.trim(), _subheadline: draft.subheadline.trim(),
      _city: draft.city, _service: draft.kind === "reserva" ? draft.service : "", _campaign: draft.campaign.trim() ? slugify(draft.campaign) : "",
      _cta: draft.cta.trim(), _thank_you: draft.thanks.trim(), _is_active: draft.active,
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(draft.id ? "Campanha atualizada" : "Campanha criada");
    onSaved();
  }

  return (
    <form onSubmit={save} className="mt-5 space-y-4 rounded-3xl bg-card p-5 shadow-soft">
      <h2 className="text-lg font-semibold">{draft.id ? "Editar campanha" : "Nova campanha"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="cp-name">Nome (só para você)</Label>
          <Input id="cp-name" value={draft.name} maxLength={80} placeholder="Ex.: Black Friday — rodízio de pizza" className="mt-1.5 h-12 rounded-xl"
            onChange={(e) => set({ name: e.target.value, ...(draft.slugTouched ? {} : { slug: slugify(e.target.value) }) })} /></div>
        <div><Label htmlFor="cp-slug">Endereço da página</Label>
          <div className="mt-1.5 flex items-center gap-1 text-sm text-muted-foreground"><span className="shrink-0">/c/</span>
            <Input id="cp-slug" value={draft.slug} maxLength={60} className="h-12 rounded-xl" onChange={(e) => set({ slug: slugify(e.target.value), slugTouched: true })} /></div>
          {draft.slug && !slugOk && <p className="mt-1 text-sm text-destructive">Use de 3 a 60 caracteres: letras, números e hífen.</p>}</div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">O que o cliente faz nesta página</legend>
        <div className="grid grid-cols-2 gap-2">
          {([["reserva", "Reservar mesa"], ["whatsapp", "Chamar no WhatsApp"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={draft.kind === k} onClick={() => set({ kind: k })}
              className={cn("h-12 rounded-2xl text-sm font-semibold transition", draft.kind === k ? "bg-primary text-primary-foreground" : "bg-surface")}>{l}</button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="cp-city">Cidade</Label>
          <NativeSelect id="cp-city" value={draft.city} onChange={(e) => set({ city: e.target.value, service: "" })} className="mt-1.5 h-12 w-full">
            <option value="">Cliente escolhe</option><option value="goiania">Goiânia</option><option value="anapolis">Anápolis</option></NativeSelect></div>
        {draft.kind === "reserva" && (
          <div><Label htmlFor="cp-service">Rodízio</Label>
            <NativeSelect id="cp-service" value={draft.service} onChange={(e) => set({ service: e.target.value })} className="mt-1.5 h-12 w-full">
              <option value="">Cliente escolhe</option>{services.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}</NativeSelect></div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="cp-head">Título da página</Label><Input id="cp-head" value={draft.headline} maxLength={90} onChange={(e) => set({ headline: e.target.value })} className="mt-1.5 h-12 rounded-xl" /></div>
        <div><Label htmlFor="cp-cta">Texto do botão</Label><Input id="cp-cta" value={draft.cta} maxLength={30} onChange={(e) => set({ cta: e.target.value })} className="mt-1.5 h-12 rounded-xl" /></div>
      </div>
      <div><Label htmlFor="cp-sub">Subtítulo (opcional)</Label><Input id="cp-sub" value={draft.subheadline} maxLength={200} placeholder="Ex.: Pizza à vontade com bebida em dobro até domingo" onChange={(e) => set({ subheadline: e.target.value })} className="mt-1.5 h-12 rounded-xl" /></div>
      <div><Label htmlFor="cp-camp">Nome da campanha nos relatórios (opcional)</Label><Input id="cp-camp" value={draft.campaign} maxLength={60} placeholder={draft.slug || "igual ao endereço"} onChange={(e) => set({ campaign: e.target.value })} className="mt-1.5 h-12 rounded-xl" />
        <p className="mt-1 text-xs text-muted-foreground">Use o mesmo nome ao lançar o gasto em Anúncios — é assim que o CAC dessa campanha é calculado.</p></div>

      <label className="flex items-center gap-3 text-sm"><Switch checked={draft.active} onCheckedChange={(v) => set({ active: v })} /> Página no ar</label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !valid} className="h-11 rounded-xl">{busy ? <Loader2 className="size-4 animate-spin" /> : "Salvar campanha"}</Button>
        <Button type="button" variant="ghost" className="h-11 rounded-xl" onClick={() => setDraft(null)}>Cancelar</Button>
      </div>
    </form>
  );
}

function Row({ p, onEdit, onChanged }: { p: Page; onEdit: () => void; onChanged: () => void }) {
  const [source, setSource] = useState("instagram");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = campaignUrl(origin, p.slug, { source, medium: "cpc" });

  async function toggle(on: boolean) {
    const { error } = await requireSupabase().rpc("campaign_page_save", {
      _id: p.id, _slug: p.slug, _name: p.name, _kind: p.kind, _headline: p.headline, _subheadline: p.subheadline ?? "", _city: p.city ?? "", _service: p.service ?? "",
      _campaign: p.campaign, _cta: p.cta_label, _thank_you: p.thank_you ?? "", _is_active: on,
    });
    if (error) { toast.error(friendlyError(error)); return; }
    onChanged();
  }
  async function remove() {
    if (!window.confirm(`Remover a campanha "${p.name}"? O link deixa de funcionar.`)) return;
    const { error } = await requireSupabase().rpc("campaign_page_delete", { _id: p.id });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Campanha removida"); onChanged();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); toast.success("Link copiado"); } catch { toast.error("Não foi possível copiar. Selecione o link e copie."); }
  }

  return (
    <li className="min-w-0 rounded-3xl bg-card p-4 shadow-soft sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{p.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {p.kind === "reserva" ? "Reserva" : "WhatsApp"} · {p.city ? CITY_LABEL[p.city] : "Qualquer cidade"}{p.kind === "reserva" && p.service ? ` · ${SERVICE_LABEL[p.service]}` : ""} · campanha “{p.campaign}”
          </p>
        </div>
        <Switch checked={p.is_active} onCheckedChange={(v) => void toggle(v)} aria-label={`Campanha ${p.name} no ar`} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Origem do anúncio" value={source} onChange={(e) => setSource(e.target.value)} className="h-11">
          {UTM_SOURCES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </NativeSelect>
        <Button className="h-11 rounded-xl" onClick={() => void copy()}><Copy className="size-4" /> Copiar link</Button>
        <a href={`/c/${p.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-input px-4 text-sm font-medium"><ExternalLink className="size-4" aria-hidden="true" /> Ver página</a>
        <Button variant="ghost" className="h-11 rounded-xl" onClick={onEdit}><Pencil className="size-4" /> Editar</Button>
        <Button variant="ghost" size="icon" className="size-11 text-muted-foreground" aria-label={`Remover ${p.name}`} onClick={() => void remove()}><Trash2 className="size-4" /></Button>
      </div>
      <p className="mt-2 break-all text-xs text-muted-foreground">{url}</p>
    </li>
  );
}
