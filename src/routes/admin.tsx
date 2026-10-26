import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Building2, CalendarDays, LayoutGrid, LogOut, Loader2, Users } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
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
  { to: "/admin/unidades", label: "Unidades", icon: Building2, exact: false },
  { to: "/admin/equipe", label: "Equipe", icon: Users, exact: false, superOnly: true },
] as const;

function AdminShell() {
  const { loading, user, roles } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user && isSupabaseConfigured) navigate({ to: "/entrar" });
  }, [loading, user, navigate]);

  if (!isSupabaseConfigured) {
    return <Center>O banco de dados ainda não foi conectado a este projeto.</Center>;
  }
  if (loading || !user) return <Center><Loader2 className="h-6 w-6 animate-spin" /></Center>;
  if (roles.length === 0) {
    return (
      <Center>
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-semibold">Acesso pendente</h1>
          <p className="mt-2 text-muted-foreground">Sua conta foi criada, mas ainda não tem permissão. Peça a um administrador para liberar seu acesso.</p>
          <Button variant="outline" className="mt-6" onClick={() => supabase?.auth.signOut()}>Sair</Button>
        </div>
      </Center>
    );
  }

  const nav = NAV.filter((n) => !("superOnly" in n) || roles.includes("super_admin"));

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <p className="px-3 py-2 text-lg font-semibold">Candeeiro</p>
        <nav className="mt-4 flex-1 space-y-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.exact }}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-foreground"
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t pt-4">
          <p className="truncate px-3 text-xs text-muted-foreground">{user.email}</p>
          <button onClick={() => supabase?.auth.signOut()} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>
      <div className="flex-1">
        <nav className="flex gap-2 overflow-x-auto border-b px-4 py-3 md:hidden">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.exact }} className="rounded-full px-4 py-1.5 text-sm text-muted-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto max-w-6xl px-5 py-8 md:px-10 md:py-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-5 text-muted-foreground">{children}</div>;
}
