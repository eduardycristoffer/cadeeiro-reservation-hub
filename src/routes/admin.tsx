import { BrandLogo } from "@/components/BrandLogo";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, Building2, CalendarDays, Headset, CheckCircle2, History, LayoutGrid, LineChart, LogOut, Loader2, Megaphone, Menu, MessageCircle, Plug, Tag, Target, Truck, UserCircle, Users } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePendingCount } from "@/lib/approvals";
import { AuthProvider, signOutLogged, useAuth } from "@/lib/auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

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
      <AdminShell />
      <Toaster position="top-center" />
    </AuthProvider>
  ),
});

const NAV = [
  { to: "/admin", label: "Início", icon: LayoutGrid, exact: true },
  { to: "/admin/reservas", label: "Reservas", icon: CalendarDays, exact: false },
  { to: "/admin/aprovacoes", label: "Aprovações", icon: CheckCircle2, exact: false },
  { to: "/admin/sac", label: "SAC", icon: Headset, exact: false },
  { to: "/admin/leads", label: "Leads WhatsApp", icon: MessageCircle, exact: false },
  { to: "/admin/delivery", label: "Delivery", icon: Truck, exact: false },
  { to: "/admin/valores", label: "Valores", icon: Tag, exact: false, managerOnly: true },
  { to: "/admin/unidades", label: "Unidades", icon: Building2, exact: false },
  { to: "/admin/equipe", label: "Equipe", icon: Users, exact: false, managerOnly: true },
  { to: "/admin/relatorios", label: "Relatórios", icon: BarChart3, exact: false, managerOnly: true },
  { to: "/admin/anuncios", label: "Anúncios", icon: LineChart, exact: false, managerOnly: true },
  { to: "/admin/campanhas", label: "Campanhas", icon: Target, exact: false, managerOnly: true },
  { to: "/admin/marketing", label: "Marketing", icon: Megaphone, exact: false, managerOnly: true },
  { to: "/admin/historico", label: "Histórico", icon: History, exact: false, managerOnly: true },
  { to: "/admin/integracoes", label: "Integrações", icon: Plug, exact: false, superOnly: true },
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

  return <Shell nav={nav} email={user.email ?? ""} />;
}

type NavItem = (typeof NAV)[number];
const PRIMARY: string[] = ["/admin", "/admin/reservas", "/admin/aprovacoes", "/admin/sac"];

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

function Shell({ nav, email }: { nav: readonly NavItem[]; email: string }) {
  const pending = usePendingCount();
  const sacOpen = useSacOpenCount();
  const badge = (to: string) => (to === "/admin/aprovacoes" ? pending : to === "/admin/sac" ? sacOpen : null);
  const [more, setMore] = useState(false);
  const primary = nav.filter((n) => PRIMARY.includes(n.to));
  const rest = nav.filter((n) => !PRIMARY.includes(n.to));
  const signOut = () => signOutLogged();
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <div className="px-3 py-2"><BrandLogo className="h-12" /></div>
        <nav aria-label="Navegação do painel" className="mt-4 flex-1 space-y-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.exact }}
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-foreground"
            >
              <n.icon className="h-4 w-4" aria-hidden="true" /> {n.label}
              <Badge n={badge(n.to)} />
            </Link>
          ))}
        </nav>
        <div className="border-t pt-4">
          <p className="truncate px-3 text-xs text-muted-foreground">{email}</p>
          <Button variant="ghost" onClick={signOut} className="mt-2 w-full justify-start gap-3 rounded-xl px-3 text-muted-foreground">
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-background/90 px-4 py-2 backdrop-blur md:hidden">
          <BrandLogo className="h-9" />
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Sair" onClick={signOut}><LogOut /></Button>
        </header>
        <main className="admin-content admin-main mx-auto min-w-0 max-w-6xl px-4 pt-5 md:px-10 md:pt-10">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Atalhos" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {primary.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.exact }} className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground data-[status=active]:font-semibold data-[status=active]:text-foreground">
              <span className="relative">
                <n.icon className="h-5 w-5" aria-hidden="true" />
                {badge(n.to) ? (
                  <span className="absolute -right-3 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">{badge(n.to)! > 99 ? "99+" : badge(n.to)}<span className="sr-only"> pendentes</span></span>
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
        <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
          <SheetHeader className="text-left"><SheetTitle>Mais opções</SheetTitle></SheetHeader>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {rest.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMore(false)} className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-4 text-sm font-medium data-[status=active]:bg-primary data-[status=active]:text-primary-foreground">
                <n.icon className="h-5 w-5 shrink-0" aria-hidden="true" /> {n.label}
              </Link>
            ))}
          </div>
          <p className="mt-4 truncate text-xs text-muted-foreground">{email}</p>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-5 text-muted-foreground">{children}</div>;
}
