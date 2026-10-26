import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
});

const ROLE_LABEL = { super_admin: "Super Admin", gestor: "Gestor", funcionario: "Funcionário" } as const;

function AdminHome() {
  const { roles } = useAuth();
  return (
    <div className="fade-up">
      <p className="text-sm text-muted-foreground">{roles.map((r) => ROLE_LABEL[r]).join(" · ")}</p>
      <h1 className="mt-1 text-4xl font-semibold">Bem-vindo</h1>
      <p className="mt-3 max-w-lg text-muted-foreground">
        Comece cadastrando as unidades e suas regras de capacidade. As reservas feitas na página pública passam a respeitar essas regras imediatamente.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg"><Link to="/admin/unidades">Gerenciar unidades</Link></Button>
        <Button asChild size="lg" variant="outline"><a href="/reservar" target="_blank" rel="noreferrer">Abrir página de reservas</a></Button>
      </div>
    </div>
  );
}
