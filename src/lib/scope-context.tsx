import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { parseScope, setActiveScope, type ScopeData } from "@/lib/scope";

type ScopeState = {
  ready: boolean;
  scope: ScopeData | null;
  /** muda a cada troca de loja: as telas usam como `key` para buscar tudo de novo */
  epoch: number;
  switchOrg: (orgId: string) => Promise<void>;
  createOrg: (name: string) => Promise<string>;
  reload: () => void;
};

const Ctx = createContext<ScopeState>({ ready: false, scope: null, epoch: 0, switchOrg: async () => {}, createOrg: async () => "", reload: () => {} });
export const useScope = () => useContext(Ctx);

export function ScopeProvider({ children }: { children: ReactNode }) {
  const { user, roles } = useAuth();
  const [scope, setScope] = useState<ScopeData | null>(null);
  const [ready, setReady] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [tick, setTick] = useState(0);
  const isStaff = roles.length > 0;
  const uid = user?.id ?? null;

  useEffect(() => {
    if (!supabase || !uid || !isStaff) { setActiveScope(null); return; }
    const sb = supabase;
    let alive = true;
    (async () => {
      let next: ScopeData | null = null;
      const { data, error } = await sb.rpc("my_scope" as never);
      if (!error) next = parseScope(data);
      if (!next) {
        // banco ainda sem a migração de várias lojas: usa as unidades que a pessoa já enxerga
        const { data: us } = await sb.from("units").select("id,name,slug,city,is_active").order("sort_order").order("name");
        const units = (us ?? []).map((u) => ({ id: u.id, name: u.name, slug: u.slug, city: u.city ?? null, is_active: u.is_active !== false }));
        next = { isSuper: roles.includes("super_admin"), role: roles[0] ?? null, orgId: null, orgName: "", orgs: [], units, defaultUnitId: units.length === 1 ? (units[0]?.id ?? null) : null };
      }
      if (!alive) return;
      setActiveScope(next);
      setScope(next);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [uid, isStaff, roles, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const switchOrg = useCallback(async (orgId: string) => {
    if (!supabase) return;
    const { error } = await supabase.rpc("platform_switch_organization" as never, { _org: orgId } as never);
    if (error) throw error;
    setEpoch((n) => n + 1);
    setTick((n) => n + 1);
  }, []);
  const createOrg = useCallback(async (name: string) => {
    if (!supabase) return "";
    const { data, error } = await supabase.rpc("platform_create_organization" as never, { _name: name } as never);
    if (error) throw error;
    const id = typeof data === "string" ? data : "";
    if (id) await switchOrg(id);
    return id;
  }, [switchOrg]);

  const value = useMemo(() => ({ ready, scope, epoch, switchOrg, createOrg, reload }), [ready, scope, epoch, switchOrg, createOrg, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
