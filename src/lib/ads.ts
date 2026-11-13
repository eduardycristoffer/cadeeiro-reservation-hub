/** Anúncios: tipos do relatório, formatação em reais e leitura do CSV de gastos (puro, testado). */

export type AdsTotals = {
  spend: number; impressions: number; clicks: number; wa_leads: number; form_leads: number; guests: number;
  reservations: number; all_reservations: number; new_customers: number; attended: number; noshow: number; cancelled: number;
  est_revenue: number; est_n: number; est_missing: number; planned: number;
};
export type AdsMetrics = {
  cac: number | null; cost_per_lead: number | null; cost_per_reservation: number | null; cost_per_attended: number | null;
  cost_per_click: number | null; avg_party: number | null; avg_ticket_estimated: number | null;
  avg_ticket_per_person_estimated: number | null; roas_estimated: number | null; attended_rate: number | null; share_of_reservations: number | null;
};
export type AdsBudget = { planned: number; spent: number; remaining: number; used_pct: number | null };
export type AdsProjection = {
  month: string; days_elapsed: number; days_in_month: number; spend_to_date: number; spend_projected: number;
  reservations_to_date: number; reservations_projected: number; new_customers_to_date: number; new_customers_projected: number;
  cac_projected: number | null; budget_month: number; budget_left_projected: number | null;
};
export type AdsByCampaign = { campaign: string; spend: number; leads: number; reservations: number; new_customers: number; cac: number | null; cost_per_reservation: number | null; est_revenue: number };
export type AdsByUnit = { unit: string; spend: number; leads: number; reservations: number };
export type AdsByDay = { day: string; spend: number; reservations: number; leads?: number };
export type AdsReport = {
  range: { from: string; to: string };
  totals: AdsTotals; metrics: AdsMetrics; budget: AdsBudget | null; projection: AdsProjection | null;
  by_campaign: AdsByCampaign[]; by_unit: AdsByUnit[]; by_day: AdsByDay[];
};

const ZERO_TOTALS: AdsTotals = {
  spend: 0, impressions: 0, clicks: 0, wa_leads: 0, form_leads: 0, guests: 0, reservations: 0, all_reservations: 0, new_customers: 0,
  attended: 0, noshow: 0, cancelled: 0, est_revenue: 0, est_n: 0, est_missing: 0, planned: 0,
};

/** Tolera resposta parcial/antiga do banco: nunca derruba a tela. */
export function parseAdsReport(raw: unknown): AdsReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<AdsReport>;
  if (!r.totals || !r.metrics) return null;
  return {
    range: r.range ?? { from: "", to: "" },
    totals: { ...ZERO_TOTALS, ...r.totals },
    metrics: r.metrics,
    budget: r.budget ?? null,
    projection: r.projection ?? null,
    by_campaign: Array.isArray(r.by_campaign) ? r.by_campaign : [],
    by_unit: Array.isArray(r.by_unit) ? r.by_unit : [],
    by_day: Array.isArray(r.by_day) ? r.by_day : [],
  };
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (v: number | null | undefined): string => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : BRL.format(Number(v)));
export const int = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : new Intl.NumberFormat("pt-BR").format(Number(v)));
export const pct = (v: number | null | undefined, digits = 0): string =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

/** Texto da meta do mês: "gastou 38% do orçamento" ou aviso quando estoura. */
export function budgetStatus(b: AdsBudget | null): { tone: "ok" | "warn" | "bad" | "none"; text: string } {
  if (!b || !b.planned) return { tone: "none", text: "Sem orçamento definido para o mês." };
  const used = b.used_pct ?? (b.planned ? (b.spent / b.planned) * 100 : 0);
  if (used > 100) return { tone: "bad", text: `Estourou o orçamento em ${brl(b.spent - b.planned)}.` };
  if (used >= 85) return { tone: "warn", text: `Já usou ${pct(used)} do orçamento. Restam ${brl(b.remaining)}.` };
  return { tone: "ok", text: `Usou ${pct(used)} do orçamento. Restam ${brl(b.remaining)}.` };
}

// ---------------------------------------------------------------- CSV de gastos

export type SpendRow = { data: string; plataforma: string; campanha: string; unidade: string; valor: string; impressoes: string; cliques: string; leads: string };
export type SpendParse = { rows: SpendRow[]; problems: { linha: number; erro: string }[] };

const HEAD: Record<string, keyof SpendRow> = {
  data: "data", dia: "data", date: "data", "dia de inicio": "data", "inicio dos relatorios": "data",
  plataforma: "plataforma", platform: "plataforma", canal: "plataforma",
  campanha: "campanha", campaign: "campanha", "nome da campanha": "campanha",
  unidade: "unidade", cidade: "unidade", unit: "unidade",
  valor: "valor", gasto: "valor", custo: "valor", "valor usado": "valor", "valor gasto": "valor", "valor usado brl": "valor", spend: "valor", amount: "valor",
  impressoes: "impressoes", impressions: "impressoes",
  cliques: "cliques", clicks: "cliques", "cliques no link": "cliques",
  leads: "leads", resultados: "leads",
};

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[()]/g, "").replace(/\s+/g, " ");

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** "dd/mm/aaaa" ou "aaaa-mm-dd" → "aaaa-mm-dd"; inválida → null. */
export function normalizeDate(v: string): string | null {
  const s = v.trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (hit) { y = +hit[1]!; m = +hit[2]!; d = +hit[3]!; }
  else if ((hit = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) { d = +hit[1]!; m = +hit[2]!; y = +hit[3]!; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "R$ 1.234,56" | "1234,56" | "1234.56" → "1234.56"; inválido → null. */
export function normalizeMoney(v: string): string | null {
  let s = v.replace(/R\$|\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return s;
}

const onlyInt = (v: string): string => { const d = v.replace(/[.\s]/g, ""); return /^\d+$/.test(d) ? d : ""; };

/** Lê o CSV (exportação da Meta ou planilha própria). Separador ";" "," ou TAB; cabeçalho obrigatório com data e valor. */
export function parseSpendCsv(text: string): SpendParse {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return { rows: [], problems: [{ linha: 1, erro: "O arquivo precisa de um cabeçalho e ao menos uma linha." }] };
  const first = lines[0]!;
  const sep = [";", "\t", ","].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const cols = splitLine(first, sep).map((h) => HEAD[fold(h)]);
  if (!cols.includes("data") || !cols.includes("valor")) {
    return { rows: [], problems: [{ linha: 1, erro: 'O cabeçalho precisa ter as colunas "data" e "valor".' }] };
  }
  const rows: SpendRow[] = [];
  const problems: { linha: number; erro: string }[] = [];
  lines.slice(1).forEach((line, idx) => {
    const cells = splitLine(line, sep);
    const o: SpendRow = { data: "", plataforma: "", campanha: "", unidade: "", valor: "", impressoes: "", cliques: "", leads: "" };
    cols.forEach((k, i) => { if (k && cells[i] !== undefined && !o[k]) o[k] = cells[i]!; });
    const linha = idx + 2;
    const data = normalizeDate(o.data);
    const valor = normalizeMoney(o.valor);
    if (!data) { problems.push({ linha, erro: `Data inválida: "${o.data}"` }); return; }
    if (!valor) { problems.push({ linha, erro: `Valor inválido: "${o.valor}"` }); return; }
    rows.push({
      data, valor,
      plataforma: fold(o.plataforma),
      campanha: o.campanha.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").slice(0, 60),
      unidade: fold(o.unidade).replace(/\s+/g, "-"),
      impressoes: onlyInt(o.impressoes), cliques: onlyInt(o.cliques), leads: onlyInt(o.leads),
    });
  });
  return { rows, problems };
}

// ---------------------------------------------------------------- links de campanha

export const UTM_SOURCES = [
  { v: "instagram", label: "Instagram" }, { v: "facebook", label: "Facebook" }, { v: "google", label: "Google" },
  { v: "tiktok", label: "TikTok" }, { v: "whatsapp", label: "WhatsApp" }, { v: "email", label: "E-mail" }, { v: "outro", label: "Outro" },
] as const;

/** Link público da campanha: /c/<slug>?utm_source=…&utm_medium=… */
export function campaignUrl(origin: string, slug: string, opts: { source?: string; medium?: string; content?: string } = {}): string {
  const q = new URLSearchParams();
  if (opts.source) q.set("utm_source", opts.source);
  if (opts.medium) q.set("utm_medium", opts.medium);
  q.set("utm_campaign", slug);
  if (opts.content) q.set("utm_content", opts.content);
  return `${origin.replace(/\/$/, "")}/c/${slug}?${q.toString()}`;
}

/** "Black Friday Pizza!" → "black-friday-pizza" (3–60 caracteres, como o banco exige). */
export function slugify(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}
export const isValidSlug = (v: string): boolean => /^[a-z0-9-]{3,60}$/.test(v);

// ---------------------------------------------------------------- período e ritmo

export const PERIODS = { hoje: "Hoje", "7d": "7 dias", "30d": "30 dias", mes: "Este mês", custom: "Outro período" } as const;
export type Period = keyof typeof PERIODS;

const isoSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
export function periodRange(p: Period, de: string, ate: string, now: Date = new Date()): [string, string] {
  const today = isoSP(now);
  const back = (n: number) => isoSP(new Date(now.getTime() - n * 86400000));
  if (p === "hoje") return [today, today];
  if (p === "7d") return [back(6), today];
  if (p === "30d") return [back(29), today];
  if (p === "mes") return [today.slice(0, 8) + "01", today];
  return [de || back(29), ate || today];
}

/**
 * Ritmo do orçamento do mês: quanto "deveria" ter gasto até hoje e a diferença.
 * gap > 0 = deixou de gastar (abaixo do plano); gap < 0 = gastou além do plano.
 */
export function paceGap(p: AdsProjection | null): { expected: number; gap: number } | null {
  if (!p || !p.budget_month || !p.days_in_month) return null;
  const expected = Math.round((p.budget_month / p.days_in_month) * p.days_elapsed * 100) / 100;
  return { expected, gap: Math.round((expected - p.spend_to_date) * 100) / 100 };
}
