// Rótulos e frases do histórico (audit_log). Lógica pura — testada em src/test/audit.test.ts.
export type AuditRow = {
  id: string;
  created_at: string;
  actor_user_id?: string | null;
  actor_name: string | null;
  actor_role: string | null;
  source: string;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  unit_id?: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
};

export const SOURCE_LABEL: Record<string, string> = {
  painel: "Painel",
  sdr_whatsapp: "WhatsApp (SDR)",
  landing_page: "Site de reservas",
  sistema: "Sistema",
  crm: "CRM",
};

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  gestor: "Admin",
  funcionario: "Operador",
};

export const ENTITY_LABEL: Record<string, string> = {
  reserva: "Reserva",
  cliente: "Cliente",
  unidade: "Unidade",
  capacidade: "Capacidade",
  bloqueio: "Bloqueio",
  preco: "Preços",
  feriado: "Feriado",
  sac: "SAC",
  config: "Configuração",
  usuario: "Usuário",
  delivery: "Delivery",
  organization: "Loja",
};

// verbo no passado, usado em "Fulano aprovou a reserva X"
const VERB: Record<string, string> = {
  "reserva.criada": "criou a reserva",
  "reserva.aprovada": "aprovou a reserva",
  "reserva.recusada": "recusou a reserva",
  "reserva.cancelada": "cancelou a reserva",
  "reserva.status_alterado": "mudou o status da reserva",
  "reserva.editada": "editou a reserva",
  "reserva.excluida": "excluiu a reserva",
  "cliente.criado": "cadastrou o cliente",
  "cliente.editado": "editou o cliente",
  "cliente.excluido": "excluiu o cliente",
  "cliente.importado": "importou contatos",
  "cliente.exportado": "exportou contatos",
  "plataforma.loja_trocada": "trocou a loja em uso",
  "plataforma.loja_criada": "criou uma loja",
  "usuario.alertas_preferencias": "mudou os alertas que recebe",
  "unidade.criada": "criou a unidade",
  "unidade.editada": "editou a unidade",
  "unidade.excluida": "excluiu a unidade",
  "capacidade.criada": "criou uma regra de capacidade",
  "capacidade.editada": "editou uma regra de capacidade",
  "capacidade.excluida": "removeu uma regra de capacidade",
  "bloqueio.criado": "criou um bloqueio de agenda",
  "bloqueio.editado": "editou um bloqueio de agenda",
  "bloqueio.removido": "removeu um bloqueio de agenda",
  "preco.criada": "criou um preço",
  "preco.editada": "alterou preços",
  "preco.excluida": "removeu um preço",
  "sac.criado": "abriu o atendimento SAC",
  "sac.status_alterado": "mudou o status do SAC",
  "sac.editado": "editou o SAC",
  "config.alterada": "alterou a configuração",
  "usuario.convidado": "convidou",
  "usuario.desativado": "desativou um usuário",
  "usuario.reativado": "reativou um usuário",
  "usuario.editado": "editou um usuário",
  "usuario.papel_alterado": "alterou o papel de um usuário",
  "usuario.papel_removido": "removeu o papel de um usuário",
  "usuario.unidade_vinculada": "vinculou uma unidade a um usuário",
  "usuario.unidade_removida": "desvinculou uma unidade de um usuário",
  "usuario.primeiro_acesso": "concluiu o primeiro acesso",
  "usuario.senha_alterada": "trocou a própria senha",
  "usuario.senha_redefinicao_pedida": "pediu para redefinir a senha",
  "usuario.2fa_ativado": "ativou a verificação em duas etapas",
  "usuario.2fa_desativado": "desativou a verificação em duas etapas",
  "usuario.2fa_removido": "removeu a verificação em duas etapas de um usuário",
  "delivery.criado": "criou o pedido de delivery",
  "delivery.status_alterado": "mudou o status do delivery",
  "delivery.editado": "editou o delivery",
  login: "entrou no painel",
  logout: "saiu do painel",
  "login.bloqueado": "teve o acesso bloqueado",
};

export const ACTION_OPTIONS = Object.keys(VERB);

export function actionLabel(action: string): string {
  return VERB[action] ?? action.replace(/[._]/g, " ");
}

export function actorLabel(row: Pick<AuditRow, "actor_name" | "actor_role" | "source">): string {
  if (row.actor_name) {
    const role = row.actor_role ? ROLE_LABEL[row.actor_role] ?? row.actor_role : null;
    return role ? `${row.actor_name} (${role})` : row.actor_name;
  }
  if (row.source === "sdr_whatsapp") return "Atendente do WhatsApp";
  if (row.source === "landing_page") return "Cliente pelo site";
  if (row.source === "crm") return "CRM";
  return "Sistema";
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

/** "Ana (Gestor) aprovou a reserva CAD-123 às 18:42" */
export function sentence(row: AuditRow): string {
  const ref = row.note && /^[A-Z]{2,5}-/.test(row.note) ? ` ${row.note}` : row.note && row.action.startsWith("unidade") ? ` ${row.note}` : "";
  const target = row.action === "usuario.convidado" && row.after && typeof row.after["full_name"] === "string" ? ` ${row.after["full_name"]}` : "";
  return `${actorLabel(row)} ${actionLabel(row.action)}${ref}${target} às ${hhmm(row.created_at)}`;
}

const HIDDEN = new Set(["updated_at", "created_at", "organization_id", "id"]);

/** Campos que mudaram entre antes e depois (ignora carimbos de data). */
export function changedFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: { key: string; from: unknown; to: unknown }[] = [];
  for (const k of keys) {
    if (HIDDEN.has(k)) continue;
    const a = before?.[k];
    const b = after?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ key: k, from: a, to: b });
  }
  return out;
}

export function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function csvCell(v: unknown): string {
  const s = fmtValue(v).replace(/"/g, '""');
  return /[",;\n]/.test(s) ? `"${s}"` : s;
}

export function toCsv(rows: AuditRow[]): string {
  const head = ["data_hora", "pessoa", "papel", "origem", "acao", "entidade", "referencia", "antes", "depois"];
  const lines = rows.map((r) =>
    [timeLabel(r.created_at), r.actor_name ?? actorLabel(r), r.actor_role ? ROLE_LABEL[r.actor_role] ?? r.actor_role : "", SOURCE_LABEL[r.source] ?? r.source, r.action, r.entity_type ? ENTITY_LABEL[r.entity_type] ?? r.entity_type : "", r.note ?? "", r.before ?? "", r.after ?? ""].map(csvCell).join(";"),
  );
  return "\uFEFF" + [head.join(";"), ...lines].join("\n");
}

export const INVITE_ERRORS: Record<string, string> = {
  FORBIDDEN: "Você não tem permissão para isso.",
  FORBIDDEN_ROLE: "Admin não pode criar Super Admin.",
  FORBIDDEN_UNIT: "Você só pode dar acesso às suas unidades.",
  UNITS_REQUIRED: "Escolha pelo menos uma unidade.",
  CANNOT_EDIT_SELF: "Você não pode alterar o próprio acesso.",
  ALREADY_EXISTS: "Já existe uma conta com esse e-mail.",
};

/** Papéis que quem convida pode atribuir. */
export function assignableRoles(isSuper: boolean): ("super_admin" | "gestor" | "funcionario")[] {
  return isSuper ? ["funcionario", "gestor", "super_admin"] : ["funcionario", "gestor"];
}
