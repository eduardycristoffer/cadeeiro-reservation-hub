import { useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { friendlyError } from "@/lib/supabase";
import { useScope } from "@/lib/scope-context";

/**
 * Loja em uso. Super admin escolhe entre as lojas (instâncias) e pode criar outra;
 * gestor e funcionário só veem a própria loja (e a unidade, quando é uma só).
 */
export function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { scope, switchOrg, createOrg } = useScope();
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  if (!scope) return null;
  const canSwitch = scope.isSuper && scope.orgs.length > 0;
  const orgName = scope.orgName || (scope.units.length === 1 ? "Minha loja" : "Rede Candeeiro");
  const oneUnit = scope.units.length === 1 ? scope.units[0] : null;
  const subtitle = oneUnit ? oneUnit.name : `${scope.units.length} unidade${scope.units.length === 1 ? "" : "s"}`;

  async function pick(id: string) {
    if (id === scope?.orgId || busy) return;
    setBusy(true);
    try { await switchOrg(id); toast.success("Loja trocada"); } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
  }
  async function create() {
    setBusy(true);
    try { await createOrg(name.trim()); toast.success("Loja criada. Agora você está nela."); setCreating(false); setName(""); }
    catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
  }

  const face = (
    <button type="button" disabled={!canSwitch} aria-label={canSwitch ? `Loja: ${orgName}. Trocar de loja` : `Loja: ${orgName}`}
      className={`flex w-full items-center gap-3 rounded-xl border bg-background px-3 py-2 text-left transition-colors ${canSwitch ? "hover:bg-sidebar-accent" : "cursor-default"} ${collapsed ? "h-11 justify-center px-0" : ""}`}>
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium leading-tight">{orgName}</span><span className="block truncate text-xs text-muted-foreground">{subtitle}</span></span>
          {canSwitch && <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </>
      )}
    </button>
  );

  const trigger = collapsed ? (
    <Tooltip><TooltipTrigger asChild>{canSwitch ? <DropdownMenuTrigger asChild>{face}</DropdownMenuTrigger> : face}</TooltipTrigger><TooltipContent side="right">{orgName} · {subtitle}</TooltipContent></Tooltip>
  ) : canSwitch ? <DropdownMenuTrigger asChild>{face}</DropdownMenuTrigger> : face;

  if (!canSwitch) return <div className="px-3">{trigger}</div>;
  return (
    <div className="px-3">
      <DropdownMenu>
        {trigger}
        <DropdownMenuContent align="start" side={collapsed ? "right" : "bottom"} className="w-64">
          <DropdownMenuLabel>Lojas</DropdownMenuLabel>
          {scope.orgs.map((o) => (
            <DropdownMenuItem key={o.id} onSelect={() => void pick(o.id)} className="min-h-10">
              <span className="min-w-0 flex-1 truncate">{o.name}</span>{o.id === scope.orgId && <Check className="h-4 w-4" aria-label="Loja em uso" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)} className="min-h-10"><Plus className="h-4 w-4" aria-hidden="true" /> Nova loja</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova loja</DialogTitle><DialogDescription>Cria uma loja separada: cada loja tem as próprias unidades, equipe, clientes e relatórios.</DialogDescription></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) void create(); }} className="space-y-4">
            <Input aria-label="Nome da loja" placeholder="Nome da loja" autoFocus maxLength={80} className="h-12" value={name} onChange={(e) => setName(e.target.value)} />
            <DialogFooter><Button type="submit" className="h-11" disabled={busy || name.trim().length < 2}>{busy && <Loader2 className="animate-spin" />}Criar loja</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
