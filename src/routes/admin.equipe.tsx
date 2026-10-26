import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/admin/bits";
import { useAuth, type Role } from "@/lib/auth";
import { friendlyError, requireSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/equipe")({
  head: () => ({ meta: [{ title: "Equipe — Candeeiro Gestão" }, { name: "robots", content: "noindex" }] }),
  component: Equipe,
});

type U = { id: string; email: string; full_name: string | null; is_active: boolean; created_at: string; roles: Role[]; unit_ids: string[] };
const ROLE_LABEL: Record<Role, string> = { super_admin: "Super Admin", gestor: "Gestor", funcionario: "Funcionário" };

function Equipe() {
  const { roles, user } = useAuth();
  const [list, setList] = useState<U[] | null>(null);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const sb = requireSupabase();
    const [{ data, error }, { data: u }] = await Promise.all([
      sb.rpc("admin_list_users"),
      sb.from("units").select("id,name").order("sort_order").order("name"),
    ]);
    if (error) setErr(friendlyError(error));
    setList((data ?? []) as U[]);
    setUnits((u ?? []) as { id: string; name: string }[]);
  }
  useEffect(() => { if (roles.includes("super_admin")) load(); }, [roles]);

  if (!roles.includes("super_admin")) {
    return <p className="text-muted-foreground">Somente o super admin gerencia a equipe.</p>;
  }

  async function act(id: string, fn: () => Promise<{ error: unknown } | void>, ok: string) {
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (res && res.error) toast.error(friendlyError(res.error));
    else toast.success(ok);
    load();
  }
  const sb = () => requireSupabase();

  const setRole = (u: U, role: Role | "") =>
    act(u.id, async () => {
      const del = await sb().from("user_roles").delete().eq("user_id", u.id);
      if (del.error || !role) return del;
      const { data: org } = await sb().from("organizations").select("id").limit(1).single();
      if (org) await sb().from("user_profiles").update({ organization_id: org.id }).eq("id", u.id);
      return sb().from("user_roles").insert({ user_id: u.id, role });
    }, role ? `Papel: ${ROLE_LABEL[role]}` : "Acesso removido");

  const toggleUnit = (u: U, unitId: string, on: boolean) =>
    act(u.id, async () => on
      ? sb().from("user_unit_access").insert({ user_id: u.id, unit_id: unitId })
      : sb().from("user_unit_access").delete().eq("user_id", u.id).eq("unit_id", unitId),
      on ? "Unidade vinculada" : "Unidade desvinculada");

  const setActive = (u: U, active: boolean) =>
    act(u.id, async () => sb().from("user_profiles").update({ is_active: active }).eq("id", u.id), active ? "Usuário ativado" : "Usuário desativado");

  return (
    <div className="fade-up">
      <h1 className="text-4xl font-semibold">Equipe</h1>
      <p className="mt-1 text-muted-foreground">Quem cria conta em /entrar aparece aqui sem acesso até receber um papel.</p>
      {err && <p className="mt-4 text-destructive">{err}</p>}
      {!list ? (
        <div className="mt-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <p className="mt-8 text-muted-foreground">Nenhum usuário cadastrado ainda.</p>
      ) : (
        <div className="mt-8 space-y-3">
          {list.map((u) => {
            const me = u.id === user?.id;
            const role = u.roles[0] ?? "";
            return (
              <div key={u.id} className="rounded-3xl bg-card p-5 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{u.full_name || u.email} {me && <span className="text-xs font-normal text-muted-foreground">(você)</span>}</p>
                    <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {busy === u.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <NativeSelect aria-label="Papel" value={role} disabled={me || busy === u.id} onChange={(e) => setRole(u, e.target.value as Role | "")}>
                      <option value="">Sem acesso</option>
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </NativeSelect>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={u.is_active} disabled={me || busy === u.id} onCheckedChange={(v) => setActive(u, v)} />
                      {u.is_active ? "Ativo" : "Inativo"}
                    </label>
                  </div>
                </div>
                {role && role !== "super_admin" && (
                  <div className="mt-4 border-t pt-4">
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Unidades</p>
                    {units.length === 0 ? <p className="text-sm text-muted-foreground">Cadastre unidades primeiro.</p> : (
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {units.map((un) => (
                          <label key={un.id} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={u.unit_ids.includes(un.id)} disabled={busy === u.id} onCheckedChange={(v) => toggleUnit(u, un.id, v === true)} />
                            {un.name}
                          </label>
                        ))}
                      </div>
                    )}
                    {u.unit_ids.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Sem unidade vinculada, não verá nenhuma reserva.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
