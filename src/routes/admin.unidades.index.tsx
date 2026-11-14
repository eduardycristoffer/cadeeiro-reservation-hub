import { createFileRoute, Link } from "@tanstack/react-router";
import { scopedUnits } from "@/lib/scope";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireSupabase, friendlyError } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/lib/scope-context";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/unidades/")({
  head: () => ({ meta: [{ title: "Unidades — Candeeiro Gestão" }, { name: "description", content: "Unidades, horários e capacidade da Rede Candeeiro." }, { property: "og:title", content: "Unidades — Candeeiro Gestão" }, { property: "og:description", content: "Unidades, horários e capacidade da Rede Candeeiro." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: Unidades,
});

type Unit = { id: string; name: string; city: string | null; is_active: boolean; accepts_online_reservations: boolean };

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function Unidades() {
  const { roles } = useAuth();
  const isSuper = roles.includes("super_admin");
  const { scope, reload } = useScope();
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error } = await scopedUnits("id,name,city,is_active,accepts_online_reservations").order("sort_order").order("name");
    if (error) setErr(friendlyError(error));
    setUnits((data ?? []) as Unit[]);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const sb = requireSupabase();
      // sempre na loja que está em uso (com mais de uma loja, "a primeira" não serve)
      let orgId = scope?.orgId ?? null;
      if (!orgId) {
        const { data: org, error: oe } = await sb.from("organizations").select("id").limit(1).maybeSingle();
        if (oe) throw oe;
        orgId = org?.id ?? null;
      }
      if (!orgId) throw new Error("Nenhuma loja selecionada.");
      const { data: unit, error } = await sb.from("units").insert({ organization_id: orgId, name: name.trim(), city: city.trim() || null, slug: `${slugify(name) || "unidade"}-${Math.random().toString(36).slice(2, 6)}` }).select("id").single();
      if (error) throw error;
      // já nasce funcionando: seg a dom, 11h às 15h, sem limite de quantidade (ajuste os horários dentro da unidade)
      const { error: re } = await sb.from("reservation_capacity_rules").insert(
        [0, 1, 2, 3, 4, 5, 6].map((d) => ({ unit_id: unit.id, weekday: d, start_time: "11:00", end_time: "15:00", slot_interval_minutes: 30, max_guests_per_slot: 9999, max_party_size: 200 })),
      );
      setName(""); setCity("");
      toast.success("Unidade criada", { description: re ? "Cadastre os horários dentro da unidade." : "Horários padrão 11h às 15h. Ajuste dentro da unidade." });
      await load();
      reload();
    } catch (e2) {
      setErr(friendlyError(e2 as { message?: string }) || "Não foi possível criar a unidade.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fade-up">
      <h1 className="text-4xl font-semibold">Unidades</h1>
      <p className="mt-2 text-muted-foreground">Horários e bloqueios de cada unidade.</p>

      {isSuper && (
        <form onSubmit={create} className="mt-8 flex flex-col gap-3 rounded-2xl bg-surface p-4 sm:flex-row">
          <Input required placeholder="Nome da unidade" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl bg-background" />
          <Input placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} className="h-11 rounded-xl bg-background sm:max-w-48" />
          <Button type="submit" disabled={saving || !name.trim()} className="h-11"><Plus /> Adicionar</Button>
        </form>
      )}
      {err && <p className="mt-4 text-sm text-destructive">{err}</p>}

      <div className="mt-8 overflow-hidden rounded-2xl border">
        {!units ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : units.length === 0 ? (
          <p className="p-10 text-center text-muted-foreground">Nenhuma unidade cadastrada ainda.{isSuper ? " Adicione a primeira acima." : ""}</p>
        ) : (
          units.map((u) => (
            <Link key={u.id} to="/admin/unidades/$unitId" params={{ unitId: u.id }} className="flex items-center justify-between border-b px-5 py-4 transition-colors last:border-0 hover:bg-surface">
              <div>
                <p className="font-medium">{u.name}</p>
                <p className="text-sm text-muted-foreground">{u.city ?? "—"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-surface px-3 py-1 text-xs text-muted-foreground">
                  {!u.is_active ? "Inativa" : u.accepts_online_reservations ? "Reservas online" : "Sem reservas online"}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
