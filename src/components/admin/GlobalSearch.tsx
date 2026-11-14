import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, Loader2, Search, User } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/lib/supabase";
import { formatPhoneE164 } from "@/lib/reservations";

export type SearchPage = { to: string; label: string; icon: LucideIcon };
type Hit = { id: string; full_name: string; phone_e164: string; unit_name: string | null };

const plain = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Busca global (Ctrl/⌘ + K): vai para uma tela, acha um cliente ou procura reservas por nome, telefone ou protocolo. */
export function GlobalSearch({ open, onOpenChange, pages }: { open: boolean; onOpenChange: (v: boolean) => void; pages: SearchPage[] }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const term = q.trim();

  useEffect(() => { if (!open) { setQ(""); setHits([]); } }, [open]);

  useEffect(() => {
    if (!open || !supabase || term.length < 2) { setHits([]); setBusy(false); return; }
    const sb = supabase;
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      void sb.rpc("customers_directory" as never, { _q: term, _unit: null, _limit: 6, _offset: 0 } as never).then(({ data, error }) => {
        if (!alive) return;
        setBusy(false);
        setHits(error || !Array.isArray(data) ? [] : (data as Hit[]).slice(0, 6));
      });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [term, open]);

  const shownPages = useMemo(() => {
    const p = plain(term);
    return (p ? pages.filter((x) => plain(x.label).includes(p)) : pages).slice(0, p ? 6 : 8);
  }, [pages, term]);

  const go = (fn: () => void) => { onOpenChange(false); fn(); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] w-[calc(100%-2rem)] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Busca</DialogTitle>
        <DialogDescription className="sr-only">Procure telas, clientes e reservas</DialogDescription>
        <Command shouldFilter={false} className="rounded-2xl">
          <CommandInput value={q} onValueChange={setQ} placeholder="Buscar tela, cliente, telefone ou protocolo…" className="h-12" />
          <CommandList className="max-h-[min(60vh,420px)]">
            {term.length >= 2 && (
              <CommandGroup heading="Reservas">
                <CommandItem value={`reservas-${term}`} onSelect={() => go(() => navigate({ to: "/admin/reservas", search: { view: "lista", cal: "mes", periodo: "todas", pagina: 1, q: term } }))}>
                  <CalendarDays className="mr-2" aria-hidden="true" /> Buscar reservas por “{term}”
                </CommandItem>
              </CommandGroup>
            )}
            {term.length >= 2 && (hits.length > 0 || busy) && (
              <CommandGroup heading="Clientes">
                {busy && hits.length === 0 && <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Procurando…</div>}
                {hits.map((h) => (
                  <CommandItem key={h.id} value={`cliente-${h.id}`} onSelect={() => go(() => navigate({ to: "/admin/leads", search: { aba: "clientes", cliente: h.id } }))}>
                    <User className="mr-2" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{h.full_name}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{formatPhoneE164(h.phone_e164)}{h.unit_name ? ` · ${h.unit_name}` : ""}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {shownPages.length > 0 && (
              <CommandGroup heading={term ? "Telas" : "Ir para"}>
                {shownPages.map((p) => (
                  <CommandItem key={p.to} value={`tela-${p.to}`} onSelect={() => go(() => navigate({ to: p.to }))}>
                    <p.icon className="mr-2" aria-hidden="true" /> {p.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {term.length >= 2 && !busy && hits.length === 0 && shownPages.length === 0 && <CommandEmpty>Nada encontrado.</CommandEmpty>}
            {term.length < 2 && <p className="px-4 pb-3 pt-1 text-xs text-muted-foreground"><Search className="mr-1 inline h-3 w-3" aria-hidden="true" />Digite pelo menos 2 letras para achar clientes e reservas.</p>}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
