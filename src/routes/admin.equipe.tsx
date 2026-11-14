import { createFileRoute } from "@tanstack/react-router";
import { scopedUnits } from "@/lib/scope";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Copy, Loader2, Mail, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, ErrorState, ListSkeleton, NativeSelect } from "@/components/admin/bits";
import { AuditTimeline } from "@/components/admin/AuditTimeline";
import { assignableRoles, INVITE_ERRORS, ROLE_LABEL, timeLabel, type AuditRow } from "@/lib/audit";
import { useAuth, type Role } from "@/lib/auth";
import { friendlyError, requireSupabase } from "@/lib/supabase";
import { inviteTeamMember, resendTeamInvite, setTeamMemberActive } from "@/lib/team.functions";

export const Route = createFileRoute("/admin/equipe")({
  head: () => ({ meta: [{ name: "description", content: "Equipe e acesso às unidades da Rede Candeeiro." }, { property: "og:title", content: "Equipe — Candeeiro Gestão" }, { property: "og:description", content: "Equipe e acesso às unidades da Rede Candeeiro." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Equipe — Candeeiro Gestão" }, { name: "robots", content: "noindex" }] }),
  component: Equipe,
});

type U = { id: string; email: string; full_name: string | null; is_active: boolean; created_at: string; last_sign_in_at: string | null; invited_at: string | null; needs_onboarding: boolean; roles: Role[]; unit_ids: string[] };
type Unit = { id: string; name: string; is_active?: boolean };

const errMsg = (e: string) => INVITE_ERRORS[e] ?? e;

/** Link de convite que não saiu por e-mail, para o gestor copiar e mandar. */
type PendingLink = { email: string; link: string; reason: string | null };
const reasonText = (reason: string | null) => (!reason || reason === "sem_provedor" ? "O envio de e-mail ainda não está configurado no sistema." : `O e-mail não saiu (${reason}).`);

function Equipe() {
  const { roles, user } = useAuth();
  const isSuper = roles.includes("super_admin");
  const allowed = isSuper || roles.includes("gestor");
  const [list, setList] = useState<U[] | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingLink | null>(null);

  const load = useCallback(async () => {
    const sb = requireSupabase();
    setErr(null);
    const [{ data, error }, { data: u }] = await Promise.all([
      sb.rpc("admin_list_team"),
      scopedUnits("id,name,is_active").order("sort_order").order("name"),
    ]);
    if (error) { setErr(friendlyError(error)); setList([]); return; }
    setList((data ?? []) as U[]);
    const all = (u ?? []) as Unit[];
    // gestor só atribui unidades que administra
    if (isSuper) setUnits(all);
    else {
      const checks = await Promise.all(all.map((x) => sb.rpc("can_manage_unit", { _user_id: user?.id, _unit_id: x.id })));
      setUnits(all.filter((_, i) => checks[i]?.data === true));
    }
  }, [isSuper, user?.id]);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  if (!allowed) return <p className="text-muted-foreground">Somente gestores e super admin gerenciam a equipe.</p>;
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? "Outra unidade";
  const current = list?.find((x) => x.id === openId) ?? null;

  return (
    <div className="fade-up">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h1 className="truncate text-2xl font-semibold sm:text-4xl">Equipe</h1>
        <Button className="h-11" onClick={() => setInvite(true)}><UserPlus className="h-4 w-4" /> Convidar pessoa</Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Cada pessoa tem seu próprio acesso. Ninguém é excluído: desative para cortar o acesso.</p>

      <div className="mt-5">
        {err ? <ErrorState message={err} onRetry={load} />
          : !list ? <ListSkeleton />
          : list.length === 0 ? <EmptyState icon={Users} title="Ninguém por aqui" text="Convide a primeira pessoa da equipe." action={<Button className="h-11" onClick={() => setInvite(true)}>Convidar pessoa</Button>} />
          : (
            <ul className="space-y-2">
              {list.map((u) => (
                <li key={u.id}>
                  <button type="button" onClick={() => setOpenId(u.id)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-soft">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{u.full_name || u.email}{u.id === user?.id && <span className="ml-1 text-xs font-normal text-muted-foreground">(você)</span>}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{u.roles[0] ? ROLE_LABEL[u.roles[0]] : "Sem papel"}</span>
                        <span>{u.roles.includes("super_admin") ? "Todas as unidades" : u.unit_ids.map(unitName).join(", ") || "Sem unidade"}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {u.needs_onboarding ? "Convidado, ainda não criou a senha" : u.last_sign_in_at ? `Último acesso ${timeLabel(u.last_sign_in_at)}` : "Nunca entrou"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${u.is_active ? "bg-status-confirmed-bg text-status-confirmed" : "bg-status-noshow-bg text-status-noshow"}`}>{u.is_active ? "Ativo" : "Inativo"}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>

      <InviteSheet open={invite} onOpenChange={setInvite} units={units} isSuper={isSuper} onDone={load} onLink={setPending} />
      <PersonSheet person={current} me={current?.id === user?.id} units={units} isSuper={isSuper} unitName={unitName} onClose={() => setOpenId(null)} onChanged={load} onLink={setPending} />
      <LinkSheet info={pending} onClose={() => setPending(null)} />
    </div>
  );
}

function UnitsPicker({ units, value, onChange, idPrefix }: { units: Unit[]; value: string[]; onChange: (v: string[]) => void; idPrefix: string }) {
  if (units.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma unidade disponível.</p>;
  return (
    <div className="grid gap-1">
      {units.map((u) => (
        <label key={u.id} htmlFor={`${idPrefix}-${u.id}`} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm hover:bg-surface">
          <Checkbox id={`${idPrefix}-${u.id}`} checked={value.includes(u.id)} onCheckedChange={(v) => onChange(v === true ? [...value, u.id] : value.filter((x) => x !== u.id))} />
          {u.name}{u.is_active === false && <span className="text-xs text-muted-foreground">(inativa)</span>}
        </label>
      ))}
    </div>
  );
}

function InviteSheet({ open, onOpenChange, units, isSuper, onDone, onLink }: { open: boolean; onOpenChange: (v: boolean) => void; units: Unit[]; isSuper: boolean; onDone: () => void; onLink: (l: PendingLink) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("funcionario");
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (open) { setEmail(""); setName(""); setRole("funcionario"); setSel(units.length === 1 ? [units[0]!.id] : []); setMsg(null); } }, [open, units]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (role !== "super_admin" && sel.length === 0) return setMsg(errMsg("UNITS_REQUIRED"));
    setBusy(true);
    const r = await inviteTeamMember({ data: { email, fullName: name, role, unitIds: role === "super_admin" ? [] : sel } })
      .catch((x: unknown) => ({ ok: false as const, error: x instanceof Error ? x.message : "Falha ao convidar" }));
    setBusy(false);
    if (!r.ok) return setMsg(errMsg(r.error));
    if (r.emailed) toast.success(`Convite enviado por e-mail para ${email}`);
    else if (r.link) onLink({ email, link: r.link, reason: r.reason });
    onOpenChange(false);
    onDone();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-lg overflow-y-auto rounded-t-3xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
        <SheetHeader className="text-left"><SheetTitle>Convidar pessoa</SheetTitle></SheetHeader>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="space-y-1.5"><Label htmlFor="iv-email">E-mail</Label>
            <Input id="iv-email" required type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl" /></div>
          <div className="space-y-1.5"><Label htmlFor="iv-name">Nome</Label>
            <Input id="iv-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl" /></div>
          <div className="flex flex-col gap-1.5 [&>*:last-child]:w-full"><Label htmlFor="iv-role">Papel</Label>
            <NativeSelect id="iv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {assignableRoles(isSuper).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </NativeSelect></div>
          {role === "super_admin" ? <p className="text-sm text-muted-foreground">Super Admin vê todas as unidades.</p> : (
            <fieldset><legend className="mb-1 text-sm font-medium">Unidades</legend><UnitsPicker units={units} value={sel} onChange={setSel} idPrefix="iv" /></fieldset>
          )}
          {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
          <Button type="submit" className="h-12 w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar convite"}</Button>
          <p className="text-xs text-muted-foreground">A pessoa recebe um e-mail com o link para criar a senha. Se o e-mail não puder ser enviado, mostramos o link para você mandar.</p>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function PersonSheet({ person, me, units, isSuper, unitName, onClose, onChanged, onLink }: { person: U | null; me: boolean; units: Unit[]; isSuper: boolean; unitName: (id: string) => string; onClose: () => void; onChanged: () => void; onLink: (l: PendingLink) => void }) {
  const [role, setRole] = useState<Role>("funcionario");
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"acesso" | "atividade">("acesso");
  const [act, setAct] = useState<AuditRow[] | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);
  const lockedSuper = !isSuper && person?.roles.includes("super_admin");

  useEffect(() => {
    if (!person) return;
    setRole(person.roles[0] ?? "funcionario"); setSel(person.unit_ids); setTab("acesso"); setAct(null); setActErr(null);
  }, [person]);

  useEffect(() => {
    if (!person || tab !== "atividade") return;
    requireSupabase().from("audit_log").select("*").or(`actor_user_id.eq.${person.id},and(entity_type.eq.usuario,entity_id.eq.${person.id})`)
      .order("created_at", { ascending: false }).limit(100)
      .then(({ data, error }) => { if (error) setActErr(friendlyError(error)); setAct((data ?? []) as AuditRow[]); });
  }, [person, tab]);

  async function save(): Promise<void> {
    if (!person) return;
    if (role !== "super_admin" && sel.length === 0) { toast.error(errMsg("UNITS_REQUIRED")); return; }
    setBusy("save");
    const { error } = await requireSupabase().rpc("admin_set_user_access", { _user_id: person.id, _role: role, _unit_ids: role === "super_admin" ? [] : sel, _full_name: null, _invited: false });
    setBusy(null);
    if (error) { toast.error(errMsg(Object.keys(INVITE_ERRORS).find((k) => error.message.includes(k)) ?? friendlyError(error))); return; }
    toast.success("Acesso atualizado");
    onChanged();
  }

  async function toggle(): Promise<void> {
    if (!person) return;
    setBusy("active");
    const r = await setTeamMemberActive({ data: { userId: person.id, active: !person.is_active } }).catch(() => ({ ok: false as const, error: "Falha de rede. Tente de novo." }));
    setBusy(null);
    if (!r.ok) { toast.error(errMsg(r.error)); return; }
    toast.success(person.is_active ? "Acesso desativado" : "Acesso reativado");
    onChanged();
  }

  async function resend(): Promise<void> {
    if (!person) return;
    setBusy("resend");
    const r = await resendTeamInvite({ data: { userId: person.id } }).catch(() => ({ ok: false as const, error: "Falha de rede. Tente de novo." }));
    setBusy(null);
    if (!r.ok) { toast.error(errMsg(r.error)); return; }
    if (r.emailed) toast.success(`Convite reenviado para ${person.email}`);
    else if (r.link) onLink({ email: person.email, link: r.link, reason: r.reason });
    onChanged();
  }

  return (
    <Sheet open={!!person} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto flex max-h-[92dvh] max-w-lg flex-col rounded-t-3xl p-0">
        {person && (
          <>
            <SheetHeader className="border-b px-4 pb-3 pt-5 text-left">
              <SheetTitle className="truncate pr-10">{person.full_name || person.email}</SheetTitle>
              <p className="truncate text-xs text-muted-foreground">{person.email} · {person.is_active ? "Ativo" : "Inativo"}</p>
              <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1" role="tablist">
                {(["acesso", "atividade"] as const).map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
                    className={`min-h-10 rounded-lg text-sm font-medium ${tab === t ? "bg-background shadow-soft" : "text-muted-foreground"}`}>{t === "acesso" ? "Acesso" : "Atividade"}</button>
                ))}
              </div>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {tab === "acesso" ? (
                me ? <p className="text-sm text-muted-foreground">Você não pode alterar o próprio acesso. Use “Meu perfil” para nome e senha.</p>
                : lockedSuper ? <p className="text-sm text-muted-foreground">Somente um Super Admin altera outro Super Admin.</p>
                : (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1.5 [&>*:last-child]:w-full"><Label htmlFor="ps-role">Papel</Label>
                      <NativeSelect id="ps-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                        {assignableRoles(isSuper).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </NativeSelect></div>
                    {role !== "super_admin" && (
                      <fieldset><legend className="mb-1 text-sm font-medium">Unidades</legend><UnitsPicker units={units} value={sel} onChange={setSel} idPrefix="ps" /></fieldset>
                    )}
                    {!isSuper && person.unit_ids.some((id) => !units.find((u) => u.id === id)) && (
                      <p className="text-xs text-muted-foreground">Unidades de outros gestores não aparecem e não são alteradas.</p>
                    )}
                    {person.needs_onboarding && person.is_active && (
                      <div className="rounded-2xl bg-surface p-3">
                        <p className="text-sm font-medium">Ainda não criou a senha</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Reenvie o convite se o e-mail não chegou ou o link venceu.</p>
                        <Button variant="outline" className="mt-2 h-11 w-full" disabled={!!busy} onClick={resend}>
                          {busy === "resend" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Mail className="h-4 w-4" /> Reenviar convite</>}
                        </Button>
                      </div>
                    )}
                    {person.invited_at && <p className="text-xs text-muted-foreground">Convidado em {timeLabel(person.invited_at)}</p>}
                    <p className="text-xs text-muted-foreground">Unidades atuais: {person.roles.includes("super_admin") ? "todas" : person.unit_ids.map(unitName).join(", ") || "nenhuma"}</p>
                  </div>
                )
              ) : actErr ? <ErrorState message={actErr} />
                : !act ? <ListSkeleton rows={3} />
                : act.length === 0 ? <EmptyState title="Sem atividade ainda" />
                : <AuditTimeline rows={act} />}
            </div>
            {tab === "acesso" && !me && !lockedSuper && (
              <footer className="grid grid-cols-2 gap-2 border-t px-4 pt-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
                <Button variant={person.is_active ? "outline" : "success"} className="h-12" disabled={!!busy} onClick={toggle}>
                  {busy === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : person.is_active ? "Desativar" : "Reativar"}
                </Button>
                <Button className="h-12" disabled={!!busy} onClick={save}>{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
              </footer>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LinkSheet({ info, onClose }: { info: PendingLink | null; onClose: () => void }) {
  async function copy(): Promise<void> {
    if (!info) return;
    try { await navigator.clipboard.writeText(info.link); toast.success("Link copiado"); }
    catch { toast.error("Não consegui copiar. Segure o link para selecionar e copiar."); }
  }
  return (
    <Sheet open={!!info} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-lg overflow-y-auto rounded-t-3xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
        {info && (
          <>
            <SheetHeader className="text-left"><SheetTitle>Mande este link para {info.email}</SheetTitle></SheetHeader>
            <p className="mt-2 text-sm text-muted-foreground">{reasonText(info.reason)} O acesso foi criado: copie o link abaixo e envie pelo WhatsApp. Ele só funciona uma vez e vence em algumas horas.</p>
            <Input readOnly value={info.link} aria-label="Link de convite" className="mt-4 h-12 rounded-xl font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button className="mt-3 h-12 w-full" onClick={copy}><Copy className="h-4 w-4" /> Copiar link</Button>
            <Button variant="outline" className="mt-2 h-12 w-full" onClick={onClose}>Fechar</Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
