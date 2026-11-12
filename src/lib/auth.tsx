import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type Role = "super_admin" | "gestor" | "funcionario";
type AuthState = {
  loading: boolean;
  user: User | null;
  roles: Role[];
  fullName: string | null;
  isActive: boolean;
  needsOnboarding: boolean;
  reload: () => void;
};

const noop = () => {};
const Ctx = createContext<AuthState>({ loading: true, user: null, roles: [], fullName: null, isActive: true, needsOnboarding: false, reload: noop });

/** Sai registrando o logout no histórico (falha no registro não impede sair). */
export async function signOutLogged() {
  if (!supabase) return;
  try { await supabase.rpc("log_auth_event", { _action: "logout" }); } catch { /* segue */ }
  await supabase.auth.signOut();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, "reload">>({ loading: true, user: null, roles: [], fullName: null, isActive: true, needsOnboarding: false });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    const sb = supabase;
    async function load() {
      const { data } = await sb.auth.getUser();
      const user = data.user ?? null;
      let roles: Role[] = [];
      let fullName: string | null = null;
      let isActive = true;
      let needsOnboarding = false;
      if (user) {
        const [{ data: r }, { data: prof }] = await Promise.all([
          sb.from("user_roles").select("role").eq("user_id", user.id),
          sb.from("user_profiles").select("is_active,full_name,needs_onboarding").eq("id", user.id).maybeSingle(),
        ]);
        const p = prof as { is_active: boolean; full_name: string | null; needs_onboarding: boolean } | null;
        isActive = p?.is_active !== false;
        fullName = p?.full_name ?? null;
        needsOnboarding = p?.needs_onboarding === true;
        roles = isActive ? ((r ?? []) as { role: Role }[]).map((x) => x.role) : [];
      }
      setState({ loading: false, user, roles, fullName, isActive, needsOnboarding });
    }
    load();
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") load();
    });
    return () => sub.subscription.unsubscribe();
  }, [tick]);

  return <Ctx.Provider value={{ ...state, reload: () => setTick((t) => t + 1) }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
