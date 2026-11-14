import { BrandLogo } from "@/components/BrandLogo";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, Bell, Building2, CalendarDays, Headset, CheckCircle2, HeartHandshake, History, LayoutGrid, LineChart, LogOut, Loader2, Megaphone, Menu, MessageCircle, PanelLeftClose, PanelLeftOpen, Plug, Search, Smartphone, Tag, Target, Truck, UserCircle, Users, Wifi } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePendingCount } from "@/lib/approvals";
import { AuthProvider, signOutLogged, useAuth } from "@/lib/auth";
import { SessionGuard } from "@/components/admin/SessionGuard";
import { clearSwr } from "@/lib/swr";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { AlertBell } from "@/components/admin/AlertBell";
import { useUnreadAlerts } from "@/lib/use-alerts";
import { setAppBadge, syncPushOnOpen } from "@/lib/app-state";
import { InstallBanner } from "@/components/app/InstallBanner";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import { OrgSwitcher } from "@/components/admin/OrgSwitcher";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ScopeProvider, useScope } from "@/lib/scope-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
      { title: "Painel — Candeeiro Gestão" },
      { name: "description", content: "Painel de gestão de reservas da Rede Candeeiro." },
      { property: "og:title", content: "Painel — Candeeiro Gestão" },
      { property: "og:description", content: "Painel de gestão de reservas." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AuthProvider>
      <ScopeProvider>
        <AdminShell />
      </ScopeProvider>
      <Toaster position="top-center" />
    </AuthProvider>
  ),
});

const NAV = [
  { to: "/admin", label: "Início", icon: LayoutGrid, exact: true },
  { to: "/admin/reservas", label: "Reservas", icon: CalendarDays, exact: false },
  { to: "/admin/aprovacoes", label: "Aprovações", icon: CheckCircle2, exact: false },
  { to: "/admin/alertas", label: "Alertas", icon: Bell, exact: false },
  { to: "/admin/sac", label: "SAC", icon: Headset, exact: false },
  { to: "/admin/leads", label: "Contatos", icon: MessageCircle, exact: false },
  { to: "/admin/delivery", label: "Delivery", icon: Truck, exact: false },
  { to: "/admin/anuncios", label: "Anúncios", icon: LineChart, exact: false, managerOnly: true },
  { to: "/admin/campanhas", label: "Campanhas", icon: Target, exact: false, managerOnly: true },
  { to: "/admin/crm", label: "CRM", icon: HeartHandshake, exact: false, managerOnly: true },
  { to: "/admin/wifi", label: "Wi-Fi", icon: Wifi, exact: false, managerOnly: true },
  { to: "/admin/marketing", label: "Marketing", icon: Megaphone, exact: false, managerOnly: true },
  { to: "/admin/relatorios", label: "Relatórios", icon: BarChart3, exact: false, managerOnly: true },
  { to: "/admin/valores", label: "Valores", icon: Tag, exact: false, managerOnly: true },
  { to: "/admin/unidades", label: "Unidades", icon: Building2, exact: false },
  { to: "/admin/equipe", label: "Equipe", icon: Users, exact: false, managerOnly: true },
  { to: "/admin/historico", label: "Histórico", icon: History, exact: false, managerOnly: true },
  { to: "/admin/integracoes", label: "Integrações", icon: Plug, exact: false, superOnly: true },
  { to: "/admin/app", label: "App", icon: Smartphone, exact: false },
  { to: "/admin/perfil", label: "Meu perfil", icon: UserCircle, exact: false },
] as const;

function AdminShell() {
  const { loading, user, roles, isActive, needsOnboarding } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user && isSupabaseConfigured) navigate({ to: "/entrar" });
    if (!loading && user && needsOnboarding && isActive) navigate({ to: "/primeiro-acesso" });
  }, [loading, user, needsOnboarding, isActive, navigate]);

  if (!isSupabaseConfigured) {
    return <Center>O banco de dados ainda não foi conectado a este projeto.</Center>;
  }
  if (loading || !user) return <Center><Loader2 className="h-6 w-6 animate-spin" /></Center>;
  if (roles.length === 0) {
    return (
      <Center>
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-semibold">{isActive ? "Acesso pendente" : "Acesso desativado"}</h1>
          <p className="mt-2 text-muted-foreground">{isActive ? "Sua conta ainda não tem permissão. Fale com o gestor da unidade." : "Seu acesso foi desativado. Fale com o gestor da unidade."}</p>
          <Button variant="outline" className="mt-6 h-11" onClick={() => supabase?.auth.signOut()}>Sair</Button>
        </div>
      </Center>
    );
  }

  const isManager = roles.includes("super_admin") || roles.includes("gestor");
  const nav = NAV.filter((n) => (!("superOnly" in n) || roles.includes("super_admin")) && (!("managerOnly" in n) || isManager));

  return <><SessionGuard /><Shell nav={nav} email={user.email ?? ""} /></>;
}

type NavItem = (typeof NAV)[number];
const PRIMARY: string[] = ["/admin", "/admin/reservas", "/admin/aprovacoes", "/admin/sac"];
/** Como o menu "Mais" agrupa o resto, para achar cada coisa sem rolar uma lista comprida. */
const MORE_GROUPS: { title: string; items: string[] }[] = [
  { title: "Atendimento", items: ["/admin/alertas", "/admin/leads", "/admin/delivery"] },
  { title: "Marketing", items: ["/admin/anuncios", "/admin/campanhas", "/admin/crm", "/admin/wifi", "/admin/marketing"] },
  { title: "Gestão", items: ["/admin/relatorios", "/admin/valores", "/admin/unidades", "/admin/equipe", "/admin/historico", "/admin/integracoes"] },
  { title: "Minha conta", items: ["/admin/app", "/admin/perfil"] },
];

/** Chamados de SAC abertos (só das unidades do usuário), atualizado em tempo real. */
function useSacOpenCount() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    const load = () => sb.rpc("sac_open_count").then(({ data }) => setN(typeof data === "number" ? data : null));
    load();
    const ch = sb.channel("sac-badge").on("postgres_changes", { event: "*", schema: "public", table: "sac_tickets" }, load).subscribe();
    const t = setInterval(load, 60_000);
    return () => { clearInterval(t); sb.removeChannel(ch); };
  }, []);
  return n;
}

function Badge({ n }: { n: number | null }) {
  if (!n) return null;
  return <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-brand-foreground">{n > 99 ? "99+" : n}<span className="sr-only"> pendentes</span></span>;
}

const SECTIONS: { title: string; items: string[] }[] = [
  { title: "Operação", items: ["/admin", "/admin/reservas", "/admin/aprovacoes"] },
  { title: "Atendimento", items: ["/admin/alertas", "/admin/sac", "/admin/leads", "/admin/delivery"] },
  { title: "Marketing", items: ["/admin/anuncios", "/admin/campanhas", "/admin/crm", "/admin/wifi", "/admin/marketing"] },
  { title: "Gestão", items: ["/admin/relatorios", "/admin/valores", "/admin/unidades", "/admin/equipe", "/admin/historico", "/admin/integracoes"] },
  { title: "Conta", items: ["/admin/app"] },
];
const COLLAPSE_KEY = "candeeiro.sidebar.collapsed";

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* sem armazenamento: segue aberto */ } }, []);
  const toggle = () => setCollapsed((c) => { const v = !c; try { window.localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch { /* ok */ } return v; });
  return [collapsed, toggle] as const;
}

/** Item do menu lateral. Recolhido, mostra só o ícone e o nome aparece ao passar o mouse (ou focar com o teclado). */
function SideLink({ n, collapsed, count }: { n: NavItem; collapsed: boolean; count: number | null }) {
  const link = (
    <Link
      to={n.to}
      activeOptions={{ exact: n.exact }}
      aria-label={collapsed ? (count ? `${n.label}: ${count} pendentes` : n.label) : undefined}
      className={cn("relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-foreground", collapsed && "justify-center px-0")}
    >
      <n.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{n.label}</span>}
      {!collapsed && <Badge n={count} />}
      {collapsed && count ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-sidebar" aria-hidden="true" /> : null}
    </Link>
  );
  if (!collapsed) return link;
  return <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right" sideOffset={10}>{n.label}{count ? ` · ${count}` : ""}</TooltipContent></Tooltip>;
}

function Shell({ nav: allNav, email }: { nav: readonly NavItem[]; email: string }) {
  const pending = usePendingCount();
  const sacOpen = useSacOpenCount();
  const alerts = useUnreadAlerts();
  const { ready, epoch } = useScope();
  useEffect(() => { clearSwr(); }, [epoch]); // trocou de loja/escopo: nada do cache antigo aparece
  const { fullName } = useAuth();
  // sem a migração de alertas no banco o contador não existe: esconde o item em vez de abrir uma tela quebrada
  const nav = allNav.filter((n) => n.to !== "/admin/alertas" || alerts !== null);
  const badge = (to: string) => (to === "/admin/aprovacoes" ? pending : to === "/admin/sac" ? sacOpen : to === "/admin/alertas" ? alerts : null);
  const [more, setMore] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useCollapsed();
  const primary = nav.filter((n) => PRIMARY.includes(n.to));
  const rest = nav.filter((n) => !PRIMARY.includes(n.to));
  const signOut = () => signOutLogged();
  const profile = nav.find((n) => n.to === "/admin/perfil");
  const pages = nav.map((n) => ({ to: n.to, label: n.label, icon: n.icon }));

  // selo com o número de alertas no ícone do app, e renovação silenciosa do aparelho nos alertas no popup
  useEffect(() => { setAppBadge(alerts); }, [alerts]);
  useEffect(() => { void syncPushOnOpen(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const initial = (fullName || email || "?").trim().charAt(0).toUpperCase();
  return (
    <TooltipProvider delayDuration={150}>
    <div className="flex min-h-screen bg-surface">
      {/* altura fixa da tela + rolagem só no meio: o menu rola sozinho, sem depender do conteúdo à direita */}
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden border-r bg-sidebar transition-[width] duration-200 md:flex", collapsed ? "w-[76px]" : "w-64")}>
        <div className={cn("flex shrink-0 items-center gap-2 px-3 pb-2 pt-4", collapsed ? "flex-col" : "justify-between")}>
          {!collapsed && <div className="min-w-0 px-1"><BrandLogo className="h-11" /></div>}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground" onClick={toggleCollapsed} aria-label={collapsed ? "Expandir menu" : "Recolher menu"} aria-expanded={!collapsed}>
                {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>{collapsed ? "Expandir menu" : "Recolher menu"}</TooltipContent>
          </Tooltip>
        </div>
        <div className="shrink-0 pb-2"><OrgSwitcher collapsed={collapsed} /></div>
        <div className="shrink-0 px-3 pb-2">
          {collapsed ? (
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-11 w-full text-muted-foreground" aria-label="Buscar" onClick={() => setSearchOpen(true)}><Search /></Button>
            </TooltipTrigger><TooltipContent side="right" sideOffset={10}>Buscar (Ctrl K)</TooltipContent></Tooltip>
          ) : (
            <button type="button" onClick={() => setSearchOpen(true)} className="flex h-10 w-full items-center gap-2 rounded-xl border bg-background px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">Buscar…</span>
              <kbd className="hidden rounded border bg-surface px-1.5 py-0.5 text-[10px] font-medium lg:inline">Ctrl K</kbd>
            </button>
          )}
        </div>
        <nav aria-label="Navegação do painel" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-width:thin]">
          {SECTIONS.map((s) => {
            const items = nav.filter((n) => s.items.includes(n.to));
            if (!items.length) return null;
            return (
              <div key={s.title} className="mt-3 first:mt-1">
                {collapsed ? <div className="mx-3 mb-2 border-t" aria-hidden="true" /> : <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">{s.title}</p>}
                <div className="space-y-0.5">{items.map((n) => <SideLink key={n.to} n={n} collapsed={collapsed} count={badge(n.to)} />)}</div>
              </div>
            );
          })}
        </nav>
        <div className={cn("shrink-0 border-t p-3", collapsed && "flex flex-col items-center gap-1")}>
          {profile && (collapsed ? <SideLink n={profile} collapsed count={null} /> : (
            <Link to={profile.to} className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden="true">{initial}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium leading-tight">{fullName || "Meu perfil"}</span><span className="block truncate text-xs text-muted-foreground">{email}</span></span>
            </Link>
          ))}
          {collapsed ? (
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair" className="h-11 w-11 text-muted-foreground"><LogOut /></Button></TooltipTrigger><TooltipContent side="right" sideOffset={10}>Sair</TooltipContent></Tooltip>
          ) : (
            <Button variant="ghost" onClick={signOut} className="mt-1 w-full justify-start gap-3 rounded-xl px-3 text-muted-foreground"><LogOut className="h-4 w-4" /> Sair</Button>
          )}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-background/80 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-xl md:hidden">
          <BrandLogo className="h-9" />
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Busca global" onClick={() => setSearchOpen(true)}><Search /></Button>
            <AlertBell count={alerts} />
          </div>
        </header>
        <main className="admin-content admin-main mx-auto min-w-0 max-w-6xl px-4 pt-5 md:px-10 md:pt-10">
          <InstallBanner />
          {ready ? <Outlet key={epoch} /> : <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando" /></div>}
        </main>
      </div>

      <nav aria-label="Atalhos" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {primary.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.exact }} className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground data-[status=active]:font-semibold data-[status=active]:text-foreground">
              <span className="relative">
                <n.icon className="h-5 w-5" aria-hidden="true" />
                {badge(n.to) ? (
                  <span className="absolute -right-3 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">{(badge(n.to) ?? 0) > 99 ? "99+" : badge(n.to)}<span className="sr-only"> pendentes</span></span>
                ) : null}
              </span>
              {n.label}
            </Link>
          ))}
          <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground">
            <Menu className="h-5 w-5" aria-hidden="true" /> Mais
          </button>
        </div>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom-sheet" className="max-h-[88dvh] overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-7">
          <SheetHeader className="text-left"><SheetTitle>Mais opções</SheetTitle></SheetHeader>
          <div className="-mx-3 mt-3"><OrgSwitcher collapsed={false} /></div>
          <div className="mt-4 space-y-4">
            {MORE_GROUPS.map((g) => {
              const items = rest.filter((n) => g.items.includes(n.to));
              if (items.length === 0) return null;
              return (
                <section key={g.title} aria-label={g.title}>
                  <h3 className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((n) => (
                      <Link key={n.to} to={n.to} onClick={() => setMore(false)} className="flex min-h-12 items-center gap-2.5 rounded-2xl bg-surface px-3.5 text-[15px] font-medium transition active:scale-[0.98] data-[status=active]:bg-primary data-[status=active]:text-primary-foreground">
                        <n.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /> <span className="min-w-0 leading-tight">{n.label}</span>
                        <Badge n={badge(n.to)} />
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
            <p className="min-w-0 truncate text-xs text-muted-foreground">{email}</p>
            <Button variant="ghost" className="h-11 shrink-0" onClick={signOut}><LogOut />Sair</Button>
          </div>
        </SheetContent>
      </Sheet>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} pages={pages} />
    </div>
    </TooltipProvider>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-5 text-muted-foreground">{children}</div>;
}
