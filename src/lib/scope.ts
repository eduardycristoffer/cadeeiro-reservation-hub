import { requireSupabase } from "@/lib/supabase";

// "Onde estou": qual loja (organização) está em uso e quais unidades a pessoa pode ver.
// Vem da função my_scope() do banco. Super admin troca de loja; os demais ficam presos à própria.

export type ScopeUnit = { id: string; name: string; slug: string; city: string | null; is_active: boolean };
export type ScopeOrg = { id: string; name: string; slug: string };
export type ScopeData = {
  isSuper: boolean;
  role: string | null;
  orgId: string | null;
  orgName: string;
  orgs: ScopeOrg[];
  units: ScopeUnit[];
  defaultUnitId: string | null;
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function parseScope(raw: unknown): ScopeData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const orgs = (Array.isArray(r["organizations"]) ? r["organizations"] : [])
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object" && typeof (o as Record<string, unknown>)["id"] === "string")
    .map((o) => ({ id: str(o["id"]), name: str(o["name"]), slug: str(o["slug"]) }));
  const units = (Array.isArray(r["units"]) ? r["units"] : [])
    .filter((u): u is Record<string, unknown> => !!u && typeof u === "object" && typeof (u as Record<string, unknown>)["id"] === "string")
    .map((u) => ({ id: str(u["id"]), name: str(u["name"]), slug: str(u["slug"]), city: typeof u["city"] === "string" ? (u["city"] as string) : null, is_active: u["is_active"] !== false }));
  return {
    isSuper: r["is_super_admin"] === true,
    role: typeof r["role"] === "string" ? (r["role"] as string) : null,
    orgId: typeof r["organization_id"] === "string" ? (r["organization_id"] as string) : null,
    orgName: str(r["organization_name"]),
    orgs,
    units,
    defaultUnitId: typeof r["default_unit_id"] === "string" ? (r["default_unit_id"] as string) : null,
  };
}

/** Unidade que já vem escolhida num formulário: a única da pessoa (gestor/funcionário da loja) ou a primeira ativa. */
export function preferredUnitId(units: { id: string; is_active?: boolean }[], defaultUnitId: string | null): string {
  if (defaultUnitId && units.some((u) => u.id === defaultUnitId)) return defaultUnitId;
  return (units.find((u) => u.is_active !== false) ?? units[0])?.id ?? "";
}

// Guardado fora do React para as telas (que buscam as próprias listas) respeitarem a loja escolhida sem mudar de forma.
let active: ScopeData | null = null;
export function setActiveScope(s: ScopeData | null) { active = s; }
export function getActiveScope(): ScopeData | null { return active; }

/** `from("units").select(...)` já limitado à loja em uso. Chame `.order(...)` em seguida, como antes. */
export function scopedUnits(columns: string) {
  let q = requireSupabase().from("units").select(columns as "*");
  if (active?.orgId) q = q.eq("organization_id", active.orgId);
  return q;
}
