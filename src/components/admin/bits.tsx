import type { ReactNode, SelectHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Cor padronizada por status — sempre acompanhada do texto. */
export const STATUS_CHIP: Record<string, string> = {
  pendente: "bg-status-pending-bg text-status-pending",
  confirmada: "bg-status-confirmed-bg text-status-confirmed",
  concluida: "bg-status-done-bg text-status-done",
  cancelada: "bg-status-cancelled-bg text-status-cancelled",
  nao_compareceu: "bg-status-noshow-bg text-status-noshow",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_CHIP[status] ?? "bg-surface text-foreground")}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {label ?? STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...props}
      className={cn(
        "h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string | undefined }) {
  return (
    <div className="@container min-w-0 rounded-3xl bg-card p-4 shadow-soft sm:p-6">
      <p className="text-sm leading-snug text-muted-foreground">{label}</p>
      {/* o número encolhe conforme a largura do card: "R$ 12.051,00" nunca quebra nem é cortado */}
      <p className="mt-2 whitespace-nowrap text-[clamp(1.125rem,13cqw,2.25rem)] font-semibold leading-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, text, action }: { icon?: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center sm:py-16">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface"><Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" /></span>
      <p className="mt-4 text-lg font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-4 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="mt-3 text-sm">{message}</p>
      {onRetry && <Button variant="outline" className="mt-4 h-11" onClick={onRetry}>Tentar de novo</Button>}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
    </div>
  );
}
