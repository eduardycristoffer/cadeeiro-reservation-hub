import { useState } from "react";
import { ChevronDown, MessageCircle } from "lucide-react";
import { changedFields, ENTITY_LABEL, fmtValue, sentence, SOURCE_LABEL, timeLabel, type AuditRow } from "@/lib/audit";

const MSG_LABEL: Record<string, string> = {
  reservation_confirmed: "WhatsApp de confirmação",
  reservation_cancelled: "WhatsApp de cancelamento",
};
const MSG_STATUS: Record<string, string> = {
  pendente: "na fila", processando: "enviando", enviado: "enviado", entregue: "entregue", lido: "lido", falhou: "falhou", cancelado: "cancelado",
};

export type TimelineItem = AuditRow & { kind?: string };

/** Lista de eventos do histórico; cada linha expande para mostrar antes/depois. */
export function AuditTimeline({ rows, showEntity = true }: { rows: TimelineItem[]; showEntity?: boolean }) {
  return (
    <ol className="space-y-2">
      {rows.map((r) => <Item key={r.id} r={r} showEntity={showEntity} />)}
    </ol>
  );
}

function Item({ r, showEntity }: { r: TimelineItem; showEntity: boolean }) {
  const [open, setOpen] = useState(false);
  if (r.kind === "mensagem") {
    const st = (r.after?.["status"] as string | undefined) ?? "";
    return (
      <li className="flex items-start gap-3 rounded-2xl bg-surface p-3 text-sm">
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium">{MSG_LABEL[r.action] ?? `Mensagem automática (${r.action})`} — {MSG_STATUS[st] ?? st}</p>
          <p className="text-xs text-muted-foreground">{timeLabel(r.created_at)} · enviada ao cliente pelo sistema</p>
          {r.note && <p className="mt-1 text-xs text-destructive">{r.note}</p>}
        </div>
      </li>
    );
  }
  const diff = changedFields(r.before, r.after);
  const canExpand = diff.length > 0;
  return (
    <li className="rounded-2xl border bg-card text-sm">
      <button type="button" disabled={!canExpand} onClick={() => setOpen((o) => !o)} aria-expanded={canExpand ? open : undefined}
        className="flex min-h-11 w-full items-start gap-3 p-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium">{sentence(r)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {timeLabel(r.created_at)} · {SOURCE_LABEL[r.source] ?? r.source}
            {showEntity && r.entity_type ? ` · ${ENTITY_LABEL[r.entity_type] ?? r.entity_type}` : ""}
          </p>
        </div>
        {canExpand && <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />}
      </button>
      {open && (
        <dl className="space-y-1.5 border-t px-3 py-3 text-xs">
          {diff.map((d) => (
            <div key={d.key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-2">
              <dt className="truncate text-muted-foreground">{d.key}</dt>
              <dd className="min-w-0 break-words"><span className="text-muted-foreground line-through">{fmtValue(d.from)}</span> → {fmtValue(d.to)}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
