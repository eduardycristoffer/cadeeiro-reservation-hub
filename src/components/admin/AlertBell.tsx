import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

export function AlertBell({ count, className = "" }: { count: number | null; className?: string }) {
  if (count === null) return null;
  return (
    <Link to="/admin/alertas" aria-label={count > 0 ? `Alertas: ${count} não lidos` : "Alertas"}
      className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-sidebar-accent ${className}`}>
      <Bell className="h-5 w-5" aria-hidden="true" />
      {count > 0 && (
        <span className="absolute right-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-brand-foreground">{count > 99 ? "99+" : count}</span>
      )}
    </Link>
  );
}
