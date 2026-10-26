import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireSupabase, friendlyError } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/unidades/")({
  component: Unidades,
});

type Unit = { id: string; name: string; city: string | null; is_active: boolean; accepts_online_reservations: boolean };

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function Unidades() {
  const { roles } = useAuth();
  const isSuper = roles.includes("super_admin");
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error } = await requireSupabase().from("units").select("id,name,city,is_active,accepts_online_reservations").order("sort_order").order("name");
    if (error) setErr(friendlyError(error));
    setUnits((data ?? []) as Unit[]);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const sb = requireSupabase();
    const { data: org } = await sb.from("organizations").select("id").limit(1).single();
    const { error } = await sb.from("units").insert({ organization_id: org?.id, name: name.trim(), city: city.trim() || null, slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}` });
    setSaving(false);
    if (error) return setErr("Não foi possível criar a unidade.");
    setName(""); setCity("");
    load();
  }

  return (
    <div className="fade-up">
      <h1 className="text-4xl font-semibold">Unidades</h1>
      <p className="mt-2 text-muted-foreground">Horários, capacidade e bloqueios de cada unidade.</p>

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
