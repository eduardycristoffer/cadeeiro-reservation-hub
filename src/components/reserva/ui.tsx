import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Loading() {
  return (
    <div className="flex justify-center py-10" role="status" aria-label="Carregando">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function StepTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="fade-up">
      <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">{title}</h1>
      {sub && <p className="mt-3 text-lg leading-snug text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Field({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-muted-foreground">{label}</span>
      {children}
      {error && <span className="mt-1.5 block text-sm text-destructive">{error}</span>}
    </label>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-wider text-muted-foreground", className)}>{children}</p>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-8 items-center gap-2 rounded-full bg-surface px-3.5 text-sm font-semibold", className)}>
      <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
      {children}
    </span>
  );
}
