// CRM do painel: modelos de mensagem, prévia ao vivo e leitura segura do que vem do banco.
// A renderização aqui repete a regra do banco (_crm_render) só para MOSTRAR a prévia; quem monta o texto enviado é o banco.

export const TEMPLATE_KEYS = ["confirmacao", "cancelamento", "followup_pos", "reaver_inativo", "reaver_lead", "remarketing", "avaliacao_google"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const VAR_NAMES = ["nome", "unidade", "cidade", "link", "link_avaliacao", "dia", "data", "hora", "pessoas", "protocolo", "motivo"] as const;
export type VarName = (typeof VAR_NAMES)[number];

export const VAR_LABEL: Record<VarName, string> = {
  nome: "Primeiro nome", unidade: "Unidade", cidade: "Cidade", link: "Link para reservar", dia: "Dia (ex.: sábado, 14/11)",
  link_avaliacao: "Link da avaliação no Google", data: "Data (14/11)", hora: "Horário", pessoas: "Nº de pessoas", protocolo: "Protocolo", motivo: "Motivo do cancelamento",
};

const RESERVATION_VARS: VarName[] = ["dia", "data", "hora", "pessoas", "protocolo"];

export const TEMPLATE_INFO: Record<TemplateKey, { label: string; when: string; marketing: boolean; vars: readonly VarName[] }> = {
  confirmacao: { label: "Reserva confirmada", when: "Enviada quando a reserva é confirmada.", marketing: false, vars: ["nome", "unidade", "cidade", "link", ...RESERVATION_VARS] },
  cancelamento: { label: "Reserva cancelada", when: "Enviada quando a reserva é cancelada, com o motivo.", marketing: false, vars: ["nome", "unidade", "cidade", "link", ...RESERVATION_VARS, "motivo"] },
  followup_pos: { label: "Follow-up pós-visita", when: "Depois que o cliente comparece: agradece e pede a opinião.", marketing: true, vars: ["nome", "unidade", "cidade", "link", ...RESERVATION_VARS] },
  reaver_inativo: { label: "Reaver cliente sumido", when: "Para quem já veio e não volta há tempo.", marketing: true, vars: ["nome", "unidade", "cidade", "link"] },
  reaver_lead: { label: "Reaver lead do WhatsApp", when: "Para quem chamou no WhatsApp e não reservou.", marketing: true, vars: ["nome", "unidade", "cidade", "link"] },
  remarketing: { label: "Remarketing (campanha)", when: "Modelo inicial das campanhas de remarketing.", marketing: true, vars: ["nome", "unidade", "cidade", "link"] },
  avaliacao_google: { label: "Pedido de avaliação no Google", when: "Modelo inicial das campanhas de avaliação: convida quem foi atendido a avaliar a unidade no Google.", marketing: true, vars: ["nome", "unidade", "cidade", "link_avaliacao"] },
};

export const SAMPLE_VARS: Record<VarName, string> = {
  nome: "Maria", unidade: "Candeeiro Goiânia", cidade: "Goiânia", link: "https://seusite.com.br/reservar?cidade=goiania", link_avaliacao: "https://g.page/r/SEU-LINK/review",
  dia: "sábado, 14/11", data: "14/11", hora: "20:00", pessoas: "4", protocolo: "CAD-ABC123", motivo: "Casa lotada nesse horário",
};

export const OPT_OUT_FOOTER = "Para não receber mais mensagens, responda SAIR.";

/** Mesma regra do banco: troca {{variável}} e remove a linha inteira cuja variável está vazia. */
export function renderTemplate(body: string, vars: Partial<Record<string, string | null | undefined>>): string {
  const out: string[] = [];
  for (const raw of body.split("\n")) {
    let line = raw;
    let keep = true;
    for (const m of raw.matchAll(/\{\{([a-z_]+)\}\}/g)) {
      const key = m[1] ?? "";
      const v = (vars[key] ?? "").trim();
      if (!v) { keep = false; break; }
      line = line.split(`{{${key}}}`).join(v);
    }
    if (keep) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Prévia com dados de exemplo; marketing leva o rodapé de saída, como no envio real. */
export function previewTemplate(key: TemplateKey, body: string, vars: Partial<Record<VarName, string>> = {}): string {
  const allowed = new Set<string>(TEMPLATE_INFO[key].vars);
  const data: Record<string, string> = {};
  for (const n of VAR_NAMES) if (allowed.has(n)) data[n] = vars[n] ?? SAMPLE_VARS[n];
  const text = renderTemplate(body, data);
  return TEMPLATE_INFO[key].marketing && !/\bsair\b/i.test(text) ? `${text}\n\n${OPT_OUT_FOOTER}` : text;
}

/** Variáveis escritas no texto que este modelo não conhece (o banco recusa nomes inválidos, mas nomes "bonitos" errados passariam em branco). */
export function unknownVars(key: TemplateKey, body: string): string[] {
  const allowed = new Set<string>(TEMPLATE_INFO[key].vars);
  const found = new Set<string>();
  for (const m of body.matchAll(/\{\{([^}]*)\}\}/g)) if (!allowed.has((m[1] ?? "").trim())) found.add((m[1] ?? "").trim());
  return [...found];
}

export const TEMPLATE_MIN = 10;
export const TEMPLATE_MAX = 800;
export const CAMPAIGN_BODY_MAX = 600;

/** Campanha de avaliação no Google: quem foi atendido nos últimos N dias (mesma faixa do banco). */
export const REVIEW_DAYS = { min: 1, default: 14, max: 90 } as const;
/** Mesma regra do banco (_crm_review_url_ok): https e só endereços do Google. */
const REVIEW_URL_RE = /^https:\/\/(g\.page|search\.google\.com|maps\.app\.goo\.gl|goo\.gl|share\.google|g\.co|(www\.|maps\.|business\.)?google\.com(\.br)?)(\/[^\s{}]*)?$/i;

/** Confere o link de avaliação antes de enviar ao banco. Devolve null quando está certo. */
export function reviewUrlProblem(url: string): string | null {
  const u = url.trim();
  if (!u) return "Cole o link de avaliação do Google desta unidade.";
  if (u.length > 500) return "O link está longo demais.";
  if (!/^https:\/\//i.test(u)) return "O link precisa começar com https://";
  if (!REVIEW_URL_RE.test(u)) return "Use o link de avaliação do Google (g.page, search.google.com, maps.app.goo.gl ou share.google).";
  return null;
}

/** O texto de uma campanha de avaliação precisa levar o link; sem ele a mensagem não serve para nada. */
export const hasReviewLink = (body: string) => body.includes("{{link_avaliacao}}");

/** Endereço curto para mostrar na lista (ex.: g.page). */
export function reviewHost(url: string | null | undefined): string {
  if (!url) return "—";
  try { return new URL(url).host; } catch { return "—"; }
}

export const AUDIENCES = [
  { id: "inativos", label: "Clientes sumidos", hint: "Já vieram, mas não voltam há alguns dias." },
  { id: "visitaram", label: "Quem já visitou", hint: "Todos que já compareceram alguma vez." },
  { id: "leads", label: "Leads do WhatsApp", hint: "Chamaram no WhatsApp e não reservaram." },
] as const;
export type AudienceId = (typeof AUDIENCES)[number]["id"];

export const SEND_KIND_LABEL: Record<string, string> = {
  followup_pos: "Pós-visita", reaver_inativo: "Reaver cliente", reaver_lead: "Reaver lead", remarketing: "Remarketing", avaliacao_google: "Avaliação Google",
};
export const SEND_STATUS_LABEL: Record<string, string> = {
  pendente: "Na fila", enviando: "Enviando", enviado: "Enviado", falhou: "Falhou", cancelado: "Cancelado",
};
export const CAMPAIGN_STATUS_LABEL: Record<string, string> = { enviando: "Em andamento", concluida: "Concluída", cancelada: "Cancelada" };

export type CrmSettings = {
  send_window_start: string; send_window_end: string; daily_cap: number; marketing_gap_days: number;
  followup_pos_enabled: boolean; followup_pos_delay_hours: number;
  reaver_inativo_enabled: boolean; reaver_inativo_days: number;
  reaver_lead_enabled: boolean; reaver_lead_hours: number;
  public_url: string;
};

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const bool = (v: unknown) => v === true;
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

export function parseSettings(raw: unknown): CrmSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    send_window_start: str(r["send_window_start"], "09:00").slice(0, 5), send_window_end: str(r["send_window_end"], "20:00").slice(0, 5),
    daily_cap: num(r["daily_cap"], 80), marketing_gap_days: num(r["marketing_gap_days"], 14),
    followup_pos_enabled: bool(r["followup_pos_enabled"]), followup_pos_delay_hours: num(r["followup_pos_delay_hours"], 20),
    reaver_inativo_enabled: bool(r["reaver_inativo_enabled"]), reaver_inativo_days: num(r["reaver_inativo_days"], 60),
    reaver_lead_enabled: bool(r["reaver_lead_enabled"]), reaver_lead_hours: num(r["reaver_lead_hours"], 24),
    public_url: str(r["public_url"]),
  };
}

/** Confere antes de enviar ao banco, com a mensagem que a pessoa entende. Devolve null quando está tudo certo. */
export function settingsProblem(s: CrmSettings): string | null {
  if (!/^\d{2}:\d{2}$/.test(s.send_window_start) || !/^\d{2}:\d{2}$/.test(s.send_window_end)) return "Informe o horário no formato HH:MM.";
  if (s.send_window_end <= s.send_window_start) return "O horário final precisa ser depois do inicial.";
  if (!Number.isInteger(s.daily_cap) || s.daily_cap < 1 || s.daily_cap > 1000) return "O limite por dia deve ficar entre 1 e 1000.";
  if (!Number.isInteger(s.marketing_gap_days) || s.marketing_gap_days < 1 || s.marketing_gap_days > 365) return "O intervalo entre mensagens deve ficar entre 1 e 365 dias.";
  if (s.followup_pos_delay_hours < 1 || s.followup_pos_delay_hours > 72) return "O follow-up pós-visita pode esperar de 1 a 72 horas.";
  if (s.reaver_inativo_days < 15 || s.reaver_inativo_days > 730) return "Cliente sumido: use de 15 a 730 dias.";
  if (s.reaver_lead_hours < 1 || s.reaver_lead_hours > 168) return "Lead: espere de 1 a 168 horas.";
  const u = s.public_url.trim();
  if (u && !/^https:\/\/[A-Za-z0-9.-]+(\/\S*)?$/.test(u)) return "O endereço do site deve começar com https://";
  return null;
}

export type CrmOverview = { daily_cap: number; sent_today: number; pending: number; failed: number; sent_7d: number; by_kind_7d: Record<string, number>; reserved_after_7d: number };

export function parseOverview(raw: unknown): CrmOverview {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const by: Record<string, number> = {};
  if (r["by_kind_7d"] && typeof r["by_kind_7d"] === "object") for (const [k, v] of Object.entries(r["by_kind_7d"] as Record<string, unknown>)) by[k] = num(v, 0);
  return {
    daily_cap: num(r["daily_cap"], 80), sent_today: num(r["sent_today"], 0), pending: num(r["pending"], 0), failed: num(r["failed"], 0),
    sent_7d: num(r["sent_7d"], 0), by_kind_7d: by, reserved_after_7d: num(r["reserved_after_7d"], 0),
  };
}

export type TemplateRow = { key: TemplateKey; body: string; default_body: string; is_custom: boolean };

export function parseTemplates(raw: unknown): TemplateRow[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateRow[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const key = (TEMPLATE_KEYS as readonly string[]).includes(String(r["key"])) ? (r["key"] as TemplateKey) : null;
    if (!key) continue;
    out.push({ key, body: str(r["body"]), default_body: str(r["default_body"]), is_custom: r["is_custom"] === true });
  }
  return out;
}

export type AudiencePreview = { total: number; sample: { nome: string; final: string }[]; max: number };

export function parseAudience(raw: unknown): AudiencePreview {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sample = Array.isArray(r["sample"]) ? (r["sample"] as unknown[]).flatMap((s) => {
    if (!s || typeof s !== "object") return [];
    const x = s as Record<string, unknown>;
    return [{ nome: str(x["nome"]), final: str(x["final"]) }];
  }) : [];
  return { total: num(r["total"], 0), sample, max: num(r["max"], 500) };
}

/** Tempo desde que a mensagem entrou na fila/foi enviada, em português curto. */
export function sinceLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.floor(min / 60)} h`;
  return `há ${Math.floor(min / 1440)} d`;
}
