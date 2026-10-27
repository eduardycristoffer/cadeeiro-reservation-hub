// Valores das unidades: tipos do resolvedor (resolve_unit_prices) e formatação para o atendente e o painel.
// Lógica pura: roda no servidor (workerd), no navegador e nos testes.

export type PriceService = "rodizio_carnes" | "rodizio_pizza" | "almoco_quilo" | "almoco_executivo";

export const PRICE_SERVICES: { id: PriceService; title: string; short: string; per: "pessoa" | "kg" }[] = [
  { id: "almoco_quilo", title: "Almoço no quilo", short: "Almoço no quilo", per: "kg" },
  { id: "rodizio_carnes", title: "Rodízio de churrasco (almoço)", short: "Rodízio de churrasco", per: "pessoa" },
  { id: "almoco_executivo", title: "Almoço executivo (somente buffet)", short: "Almoço executivo", per: "pessoa" },
  { id: "rodizio_pizza", title: "Rodízio de pizzas (jantar)", short: "Rodízio de pizzas", per: "pessoa" },
];
export const SERVICE_BY_ID = Object.fromEntries(PRICE_SERVICES.map((s) => [s.id, s])) as Record<PriceService, (typeof PRICE_SERVICES)[number]>;

export type RawRule = { weekdays: number[]; on_holidays: boolean; amount: number };
export type RawChild = {
  free_until_age: number | null; child_from_age: number | null; child_to_age: number | null;
  child_amount: number | null; full_from_age: number | null;
} | null;
export type RawService = {
  service: PriceService; table_id: string; table_name: string; valid_from: string | null; valid_until: string | null;
  rules: RawRule[]; price_on_date: number | null; child: RawChild;
};
export type RawPrices = {
  unit: { id: string; slug: string; name: string; city: string | null; services: string[]; has_delivery: boolean };
  date: string; weekday: number; is_holiday: boolean; holiday_name: string | null; services: RawService[];
};

export const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** R$ 79,90 (espaço comum, sem NBSP). */
export function brl(n: number): string {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

const DAY_SHORT: Record<number, string> = { 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado", 0: "domingo" };
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0]; // sábado e domingo ficam juntos
const SUN_FIRST = [0, 1, 2, 3, 4, 5, 6]; // domingo junto com segunda ("domingo a sexta")

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const named = (d: number, last: boolean) => (last && d >= 1 && d <= 5 ? `${DAY_SHORT[d]}-feira` : DAY_SHORT[d]!);

/**
 * Rótulo dos dias de uma regra, como a casa divulga:
 * [1..5] -> "Segunda a sexta-feira"; [6,0]+feriados -> "Sábados, domingos e feriados"; [5,0] -> "Sexta-feira e domingo".
 */
export function weekdaysLabel(weekdays: number[], onHolidays = false): string {
  const set = new Set(weekdays);
  if (set.size === 7) return onHolidays ? "Todos os dias, inclusive feriados" : "Todos os dias";
  if (set.size === 2 && set.has(6) && set.has(0)) return onHolidays ? "Sábados, domingos e feriados" : "Sábados e domingos";
  const runsOf = (order: number[]): number[][] => {
    const runs: number[][] = [];
    order.forEach((d, i) => {
      if (!set.has(d)) return;
      const last = runs[runs.length - 1];
      if (last && set.has(order[i - 1]!)) last.push(d);
      else runs.push([d]);
    });
    return runs;
  };
  const a = runsOf(MON_FIRST);
  const b = runsOf(SUN_FIRST);
  const runs = b.length < a.length ? b : a;
  const parts = runs.map((r) => {
    if (r.length >= 3) return `${cap(named(r[0]!, false))} a ${named(r[r.length - 1]!, true)}`;
    if (r.length === 2) return `${cap(named(r[0]!, false))} e ${named(r[1]!, true)}`;
    return cap(named(r[0]!, true));
  });
  if (parts.length === 0) return "Feriados";
  if (onHolidays) parts.push("feriados");
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2 && !onHolidays) return `${parts[0]} e ${parts[1]!.charAt(0).toLowerCase()}${parts[1]!.slice(1)}`;
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/** "de 0 a 5 anos não paga; de 6 a 10 anos R$ 29,90; a partir de 11 anos, valor integral" */
export function childLabel(c: RawChild): string | null {
  if (!c) return null;
  const parts: string[] = [];
  if (c.free_until_age !== null && c.free_until_age !== undefined) parts.push(`de 0 a ${c.free_until_age} anos não paga`);
  if (c.child_from_age !== null && c.child_to_age !== null && c.child_amount !== null && c.child_from_age !== undefined) {
    parts.push(`de ${c.child_from_age} a ${c.child_to_age} anos ${brl(Number(c.child_amount))}`);
  }
  if (c.full_from_age !== null && c.full_from_age !== undefined) parts.push(`a partir de ${c.full_from_age} anos, valor integral`);
  return parts.length ? parts.join("; ") : null;
}

export type FormattedService = {
  codigo: PriceService;
  titulo: string;
  cobrado_por: "pessoa" | "kg";
  tabela: string;
  vigencia: string | null;
  linhas: { dias: string; valor: number; valor_texto: string }[];
  hoje: { dia: string; valor: number; valor_texto: string } | null;
  infantil: string | null;
};

const per = (p: "pessoa" | "kg") => (p === "kg" ? "o kg" : "por pessoa");

function vigencia(from: string | null, to: string | null): string | null {
  const br = (iso: string) => iso.split("-").reverse().join("/");
  if (from && to) return `de ${br(from)} a ${br(to)}`;
  if (from) return `a partir de ${br(from)}`;
  if (to) return `até ${br(to)}`;
  return null;
}

export function formatServices(raw: RawPrices): FormattedService[] {
  const dayName = raw.is_holiday && raw.holiday_name ? `feriado (${raw.holiday_name})` : WEEKDAY_NAMES[raw.weekday]!;
  return raw.services.map((s) => {
    const meta = SERVICE_BY_ID[s.service];
    return {
      codigo: s.service,
      titulo: meta.title,
      cobrado_por: meta.per,
      tabela: s.table_name,
      vigencia: vigencia(s.valid_from, s.valid_until),
      linhas: s.rules.map((r) => ({ dias: weekdaysLabel(r.weekdays, r.on_holidays), valor: Number(r.amount), valor_texto: `${brl(Number(r.amount))} ${per(meta.per)}` })),
      hoje: s.price_on_date === null ? null : { dia: dayName, valor: Number(s.price_on_date), valor_texto: `${brl(Number(s.price_on_date))} ${per(meta.per)}` },
      infantil: childLabel(s.child),
    };
  });
}

export const PRICE_DISCLAIMER = "Todos os valores estão sujeitos a alteração.";

/** Texto completo no estilo da divulgação da casa (o atendente escolhe o que mostrar). */
export function priceText(raw: RawPrices): string {
  const out: string[] = [`Valores — ${raw.unit.name}`];
  for (const s of formatServices(raw)) {
    out.push("", `• ${s.titulo}`);
    for (const l of s.linhas) out.push(`  ${l.dias}: ${l.valor_texto}`);
    if (s.infantil) out.push(`  Infantil: ${s.infantil}`);
  }
  out.push("", `Obs.: ${PRICE_DISCLAIMER}`);
  return out.join("\n");
}

/** Escolhe o valor de um serviço numa data (espelha resolve_unit_prices, para o painel e testes). */
export function priceOnDate(rules: RawRule[], weekday: number, isHoliday: boolean): number | null {
  if (isHoliday) {
    const h = rules.find((r) => r.on_holidays);
    if (h) return Number(h.amount);
  }
  const r = rules.find((x) => x.weekdays.includes(weekday));
  return r ? Number(r.amount) : null;
}
