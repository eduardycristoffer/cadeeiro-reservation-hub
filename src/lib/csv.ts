// CSV para Excel brasileiro: UTF-8 com BOM, separador ";" e datas dd/mm/aaaa HH:mm.
const ISO_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_D = /^\d{4}-\d{2}-\d{2}$/;

export function fmtCsvDate(v: string): string {
  if (ISO_D.test(v)) { const [y, m, d] = v.split("-"); return `${d}/${m}/${y}`; }
  const d = new Date(v);
  const p = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}/${g("month")}/${g("year")} ${g("hour")}:${g("minute")}`;
}

function cell(v: unknown): string {
  let s: string;
  if (v === null || v === undefined) s = "";
  else if (typeof v === "string" && (ISO_DT.test(v) || ISO_D.test(v))) s = fmtCsvDate(v);
  else if (typeof v === "number") s = String(v).replace(".", ",");
  else if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsvTable(headers: string[], rows: unknown[][]): string {
  return "\uFEFF" + [headers.map(cell).join(";"), ...rows.map((r) => r.map(cell).join(";"))].join("\r\n");
}

export function downloadCsv(name: string, csv: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Variação % entre períodos; null quando não há base de comparação. */
export function pctChange(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}
