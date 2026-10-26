import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type Role = "super_admin" | "gestor" | "funcionario";
type AuthState = { loading: boolean; user: User | null; roles: Role[] };

const Ctx = createContext<AuthState>({ loading: true, user: null, roles: [] });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, roles: [] });

  useEffect(() => {
    if (!supabase) {
      setState({ loading: false, user: null, roles: [] });
      return;
    }
    const sb = supabase;
    async function load() {
      const { data } = await sb.auth.getUser();
      const user = data.user ?? null;
      let roles: Role[] = [];
      if (user) {
        const [{ data: r }, { data: prof }] = await Promise.all([
          sb.from("user_roles").select("role").eq("user_id", user.id),
          sb.from("user_profiles").select("is_active").eq("id", user.id).maybeSingle(),
        ]);
        const active = (prof as { is_active: boolean } | null)?.is_active !== false;
        roles = active ? ((r ?? []) as { role: Role }[]).map((x) => x.role) : [];
      }
      setState({ loading: false, user, roles });
    }
    load();
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") load();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
