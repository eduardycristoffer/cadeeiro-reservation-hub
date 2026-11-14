// Base de contatos: leitura do CSV de importação e geração do CSV de exportação (as colunas são as mesmas, então dá para exportar, ajustar e importar de volta).

export type ContactRow = { nome: string; telefone: string; email: string; observacoes: string; aceita_whatsapp: string };
export type ContactProblem = { linha: number; erro: string };
export type ContactParse = { rows: ContactRow[]; problems: ContactProblem[] };

export const MAX_IMPORT_ROWS = 5000;
export const IMPORT_HEADERS = ["Nome", "Telefone", "E-mail", "Observações", "Aceita WhatsApp"] as const;
export const IMPORT_TEMPLATE = "﻿" + [IMPORT_HEADERS.join(";"), "Maria Souza;(62) 99999-0000;maria@exemplo.com;Prefere mesa na varanda;sim"].join("\r\n");

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const HEAD: Record<string, keyof ContactRow> = {
  nome: "nome", nomecompleto: "nome", cliente: "nome", name: "nome", fullname: "nome",
  telefone: "telefone", celular: "telefone", whatsapp: "telefone", fone: "telefone", phone: "telefone", contato: "telefone",
  email: "email", mail: "email",
  observacoes: "observacoes", observacao: "observacoes", obs: "observacoes", notas: "observacoes", nota: "observacoes",
  aceitawhatsapp: "aceita_whatsapp", aceita: "aceita_whatsapp", optin: "aceita_whatsapp", autorizawhatsapp: "aceita_whatsapp",
};

/** Divide uma linha respeitando aspas ("a;b" fica numa célula só). */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Telefone brasileiro válido (mesma regra do banco): DDD + 8 ou 9 dígitos, com ou sem 55. */
export function isValidBrPhone(raw: string): boolean {
  let d = raw.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return /^55[1-9][0-9](9[0-9]{8}|[2-8][0-9]{7})$/.test(d);
}

export function parseContactsCsv(text: string): ContactParse {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return { rows: [], problems: [{ linha: 1, erro: "O arquivo precisa de um cabeçalho e ao menos um contato." }] };
  const first = lines[0]!;
  const sep = [";", "\t", ","].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const cols = splitCsvLine(first, sep).map((h) => HEAD[fold(h)]);
  if (!cols.includes("nome") || !cols.includes("telefone")) {
    return { rows: [], problems: [{ linha: 1, erro: 'O cabeçalho precisa ter as colunas "Nome" e "Telefone".' }] };
  }
  if (lines.length - 1 > MAX_IMPORT_ROWS) {
    return { rows: [], problems: [{ linha: 1, erro: `Máximo de ${MAX_IMPORT_ROWS.toLocaleString("pt-BR")} contatos por arquivo. Divida em partes.` }] };
  }
  const rows: ContactRow[] = [];
  const problems: ContactProblem[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((line, idx) => {
    const cells = splitCsvLine(line, sep);
    const o: ContactRow = { nome: "", telefone: "", email: "", observacoes: "", aceita_whatsapp: "" };
    cols.forEach((k, i) => { if (k && cells[i] !== undefined && !o[k]) o[k] = cells[i]!; });
    const linha = idx + 2;
    if (o.nome.trim().length < 2) { problems.push({ linha, erro: "Nome vazio ou muito curto" }); return; }
    if (!isValidBrPhone(o.telefone)) { problems.push({ linha, erro: `Telefone inválido: "${o.telefone}"` }); return; }
    if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) { problems.push({ linha, erro: `E-mail inválido: "${o.email}"` }); return; }
    const key = o.telefone.replace(/\D/g, "").replace(/^55/, "");
    if (seen.has(key)) { problems.push({ linha, erro: "Telefone repetido no arquivo (linha ignorada)" }); return; }
    seen.add(key);
    rows.push(o);
  });
  return { rows, problems };
}

export const EXPORT_HEADERS = ["Nome", "Telefone", "E-mail", "Observações", "Aceita WhatsApp", "Unidade", "Origem", "Reservas", "Última reserva", "Cadastro"];
const SOURCE_LABEL: Record<string, string> = {
  painel: "Cadastro no painel", reserva_site: "Reserva pelo site", whatsapp: "WhatsApp", importacao: "Importação", wifi: "Wi-Fi", delivery: "Delivery", outro: "Outro",
};
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;
