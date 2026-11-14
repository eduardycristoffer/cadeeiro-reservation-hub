import { describe, expect, it } from "vitest";
import { splitMonthSpend, brl, budgetStatus, campaignUrl, isValidSlug, normalizeDate, normalizeMoney, paceGap, parseAdsReport, parseSpendCsv, pct, periodRange, slugify } from "@/lib/ads";

describe("formatação", () => {
  it("reais e porcentagem em pt-BR; vazio vira traço", () => {
    expect(brl(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(brl(null)).toBe("—");
    expect(pct(11.1, 1)).toBe("11,1%");
    expect(pct(undefined)).toBe("—");
  });
});

describe("orçamento", () => {
  it("sem orçamento, dentro, perto do limite e estourado", () => {
    expect(budgetStatus(null).tone).toBe("none");
    expect(budgetStatus({ planned: 0, spent: 10, remaining: 0, used_pct: null }).tone).toBe("none");
    expect(budgetStatus({ planned: 1000, spent: 100, remaining: 900, used_pct: 10 }).tone).toBe("ok");
    expect(budgetStatus({ planned: 1000, spent: 900, remaining: 100, used_pct: 90 }).tone).toBe("warn");
    const bad = budgetStatus({ planned: 1000, spent: 1200, remaining: -200, used_pct: 120 });
    expect(bad.tone).toBe("bad");
    expect(bad.text).toContain("200,00");
  });
});

describe("parseAdsReport", () => {
  it("rejeita lixo e completa campos que faltam", () => {
    expect(parseAdsReport(null)).toBeNull();
    expect(parseAdsReport({})).toBeNull();
    const r = parseAdsReport({ totals: { spend: 10 }, metrics: { cac: null } });
    expect(r?.totals.spend).toBe(10);
    expect(r?.totals.reservations).toBe(0);
    expect(r?.by_campaign).toEqual([]);
    expect(r?.budget).toBeNull();
  });
});

describe("datas e valores do CSV", () => {
  it("aceita dd/mm/aaaa e aaaa-mm-dd; rejeita datas impossíveis", () => {
    expect(normalizeDate("05/11/2026")).toBe("2026-11-05");
    expect(normalizeDate("2026-11-05")).toBe("2026-11-05");
    expect(normalizeDate("2026-11-05T10:00:00")).toBe("2026-11-05");
    expect(normalizeDate("31/02/2026")).toBeNull();
    expect(normalizeDate("ontem")).toBeNull();
  });
  it("valores em formato brasileiro e americano", () => {
    expect(normalizeMoney("R$ 1.234,56")).toBe("1234.56");
    expect(normalizeMoney("150,5")).toBe("150.5");
    expect(normalizeMoney("150.50")).toBe("150.50");
    expect(normalizeMoney("1.234.567")).toBe("1234567");
    expect(normalizeMoney("-3")).toBeNull();
    expect(normalizeMoney("abc")).toBeNull();
    expect(normalizeMoney("")).toBeNull();
  });
});

describe("parseSpendCsv", () => {
  it("lê planilha própria com ';' e converte campos", () => {
    const csv = "data;plataforma;campanha;unidade;valor;impressoes;cliques\n05/11/2026;Meta;Black Friday;Goiânia;R$ 100,50;1.200;40\n06/11/2026;;pascoa;;60;;";
    const { rows, problems } = parseSpendCsv(csv);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ data: "2026-11-05", plataforma: "meta", campanha: "black-friday", unidade: "goiania", valor: "100.50", impressoes: "1200", cliques: "40" });
    expect(rows[1]).toMatchObject({ data: "2026-11-06", campanha: "pascoa", unidade: "", valor: "60", impressoes: "" });
  });
  it("entende cabeçalhos da exportação da Meta (vírgula, com acento)", () => {
    const csv = '"Dia","Nome da campanha","Valor usado (BRL)","Impressões","Cliques no link"\n"2026-11-05","Pizza-Dobro","88,40","900","31"';
    const { rows, problems } = parseSpendCsv(csv);
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({ data: "2026-11-05", campanha: "pizza-dobro", valor: "88.40", impressoes: "900", cliques: "31" });
  });
  it("aponta a linha com problema sem perder as boas", () => {
    const csv = "data;valor\n05/11/2026;10\nxx;20\n07/11/2026;abc";
    const { rows, problems } = parseSpendCsv(csv);
    expect(rows).toHaveLength(1);
    expect(problems.map((p) => p.linha)).toEqual([3, 4]);
  });
  it("sem colunas obrigatórias ou vazio devolve erro claro", () => {
    expect(parseSpendCsv("foo;bar\n1;2").problems[0]?.erro).toContain("data");
    expect(parseSpendCsv("").problems).toHaveLength(1);
    expect(parseSpendCsv("data;valor").rows).toEqual([]);
  });
  it("ignora BOM e usa TAB como separador", () => {
    const { rows } = parseSpendCsv("﻿data\tvalor\n2026-11-05\t12,3");
    expect(rows[0]).toMatchObject({ data: "2026-11-05", valor: "12.3" });
  });
});

describe("campanhas", () => {
  it("slugify tira acento e símbolos", () => {
    expect(slugify("Black Friday Pizza!")).toBe("black-friday-pizza");
    expect(slugify("  Rodízio de Carnes — Anápolis ")).toBe("rodizio-de-carnes-anapolis");
    expect(slugify("---")).toBe("");
  });
  it("valida slug como o banco (3–60, minúsculas, números e hífen)", () => {
    expect(isValidSlug("black-friday")).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("Black")).toBe(false);
    expect(isValidSlug("a_b_c")).toBe(false);
  });
  it("monta o link com UTMs", () => {
    expect(campaignUrl("https://site.com/", "black-friday", { source: "instagram", medium: "cpc" }))
      .toBe("https://site.com/c/black-friday?utm_source=instagram&utm_medium=cpc&utm_campaign=black-friday");
    expect(campaignUrl("https://site.com", "x-yz")).toBe("https://site.com/c/x-yz?utm_campaign=x-yz");
  });
});

describe("período e ritmo", () => {
  const now = new Date("2026-11-12T15:00:00Z");
  it("periodRange usa o dia de Brasília", () => {
    expect(periodRange("hoje", "", "", now)).toEqual(["2026-11-12", "2026-11-12"]);
    expect(periodRange("7d", "", "", now)).toEqual(["2026-11-06", "2026-11-12"]);
    expect(periodRange("mes", "", "", now)).toEqual(["2026-11-01", "2026-11-12"]);
    expect(periodRange("custom", "2026-10-01", "2026-10-31", now)).toEqual(["2026-10-01", "2026-10-31"]);
  });
  it("paceGap: positivo = deixou de gastar; negativo = passou do plano", () => {
    const base = { month: "2026-11-01", days_elapsed: 12, days_in_month: 30, spend_to_date: 310, spend_projected: 775, reservations_to_date: 4, reservations_projected: 10, new_customers_to_date: 3, new_customers_projected: 8, cac_projected: 103.33, budget_month: 2800, budget_left_projected: 2025 };
    expect(paceGap(base)).toEqual({ expected: 1120, gap: 810 });
    expect(paceGap({ ...base, spend_to_date: 1500 })?.gap).toBe(-380);
    expect(paceGap({ ...base, budget_month: 0 })).toBeNull();
    expect(paceGap(null)).toBeNull();
  });
});

describe("splitMonthSpend (gasto do mês dividido por dia)", () => {
  it("mês fechado: soma exata, sobra de centavos nos últimos dias", () => {
    const rows = splitMonthSpend("2026-09", 1000, "2026-11-13");
    expect(rows).toHaveLength(30);
    expect(rows[0]!.date).toBe("2026-09-01");
    expect(rows.reduce((a, r) => a + Math.round(r.amount * 100), 0)).toBe(100000);
    expect(rows[0]!.amount).toBe(33.33);
    expect(rows[29]!.amount).toBe(33.34);
  });
  it("mês corrente: só até hoje", () => {
    const rows = splitMonthSpend("2026-11", 130, "2026-11-13");
    expect(rows).toHaveLength(13);
    expect(rows.every((r) => r.amount === 10)).toBe(true);
    expect(rows.at(-1)!.date).toBe("2026-11-13");
  });
  it("mês futuro ou valor zero: nada", () => {
    expect(splitMonthSpend("2026-12", 100, "2026-11-13")).toEqual([]);
    expect(splitMonthSpend("2026-10", 0, "2026-11-13")).toEqual([]);
  });
});
