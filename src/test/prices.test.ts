import { describe, expect, it } from "vitest";
import { brl, childLabel, formatServices, priceOnDate, priceText, weekdaysLabel, type RawPrices } from "@/lib/prices";

describe("rótulo dos dias (como a casa divulga)", () => {
  it("faixas contínuas", () => {
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe("Segunda a sexta-feira");
    expect(weekdaysLabel([1, 2, 3, 4])).toBe("Segunda a quinta-feira");
    expect(weekdaysLabel([1, 2, 3, 4, 5, 6])).toBe("Segunda a sábado");
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5])).toBe("Domingo a sexta-feira");
    expect(weekdaysLabel([0, 1, 2, 3, 4])).toBe("Domingo a quinta-feira");
    expect(weekdaysLabel([5, 6, 0])).toBe("Sexta a domingo");
  });
  it("dias soltos e pares", () => {
    expect(weekdaysLabel([6])).toBe("Sábado");
    expect(weekdaysLabel([0])).toBe("Domingo");
    expect(weekdaysLabel([5])).toBe("Sexta-feira");
    expect(weekdaysLabel([5, 0])).toBe("Sexta-feira e domingo");
    expect(weekdaysLabel([6, 0])).toBe("Sábados e domingos");
  });
  it("feriados", () => {
    expect(weekdaysLabel([6, 0], true)).toBe("Sábados, domingos e feriados");
    expect(weekdaysLabel([1, 2, 3, 4, 5], true)).toBe("Segunda a sexta-feira e feriados");
    expect(weekdaysLabel([], true)).toBe("Feriados");
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Todos os dias");
  });
  it("ordem independe da entrada", () => {
    expect(weekdaysLabel([5, 3, 1, 2, 4])).toBe("Segunda a sexta-feira");
  });
});

describe("dinheiro e infantil", () => {
  it("formata em reais", () => {
    expect(brl(79.9)).toBe("R$ 79,90");
    expect(brl(109.9)).toBe("R$ 109,90");
    expect(brl(0)).toBe("R$ 0,00");
  });
  it("política infantil", () => {
    expect(childLabel({ free_until_age: 5, child_from_age: 6, child_to_age: 10, child_amount: 29.9, full_from_age: 11 }))
      .toBe("de 0 a 5 anos não paga; de 6 a 10 anos R$ 29,90; a partir de 11 anos, valor integral");
    expect(childLabel({ free_until_age: 4, child_from_age: 5, child_to_age: 9, child_amount: 25.9, full_from_age: 10 }))
      .toBe("de 0 a 4 anos não paga; de 5 a 9 anos R$ 25,90; a partir de 10 anos, valor integral");
    expect(childLabel(null)).toBeNull();
  });
});

const goiania: RawPrices = {
  unit: { id: "u1", slug: "goiania", name: "Candeeiro Goiânia", city: "Goiânia", services: ["almoco_quilo", "rodizio_pizza"], has_delivery: false },
  date: "2026-10-31", weekday: 6, is_holiday: false, holiday_name: null,
  services: [
    {
      service: "almoco_quilo", table_id: "t1", table_name: "Tabela do mês", valid_from: "2026-10-01", valid_until: "2026-10-31",
      rules: [{ weekdays: [1, 2, 3, 4, 5], on_holidays: false, amount: 89.9 }, { weekdays: [6, 0], on_holidays: true, amount: 109.9 }],
      price_on_date: 109.9, child: null,
    },
    {
      service: "rodizio_pizza", table_id: "t1", table_name: "Tabela do mês", valid_from: "2026-10-01", valid_until: "2026-10-31",
      rules: [
        { weekdays: [1, 2, 3, 4], on_holidays: false, amount: 39.9 },
        { weekdays: [5, 0], on_holidays: false, amount: 44.9 },
        { weekdays: [6], on_holidays: false, amount: 49.9 },
      ],
      price_on_date: 49.9,
      child: { free_until_age: 5, child_from_age: 6, child_to_age: 10, child_amount: 29.9, full_from_age: 11 },
    },
  ],
};

describe("texto no estilo da divulgação", () => {
  it("monta as linhas, a política infantil e o aviso", () => {
    const text = priceText(goiania);
    expect(text).toContain("Valores — Candeeiro Goiânia");
    expect(text).toContain("• Almoço no quilo");
    expect(text).toContain("Segunda a sexta-feira: R$ 89,90 o kg");
    expect(text).toContain("Sábados, domingos e feriados: R$ 109,90 o kg");
    expect(text).toContain("• Rodízio de pizzas (jantar)");
    expect(text).toContain("Segunda a quinta-feira: R$ 39,90 por pessoa");
    expect(text).toContain("Sexta-feira e domingo: R$ 44,90 por pessoa");
    expect(text).toContain("Sábado: R$ 49,90 por pessoa");
    expect(text).toContain("Infantil: de 0 a 5 anos não paga; de 6 a 10 anos R$ 29,90; a partir de 11 anos, valor integral");
    expect(text).toContain("sujeitos a alteração");
  });
  it("valor de hoje por serviço", () => {
    const [kg, pizza] = formatServices(goiania);
    expect(kg!.hoje).toEqual({ dia: "sábado", valor: 109.9, valor_texto: "R$ 109,90 o kg" });
    expect(pizza!.hoje!.valor_texto).toBe("R$ 49,90 por pessoa");
    expect(kg!.vigencia).toBe("de 01/10/2026 a 31/10/2026");
  });
  it("em feriado o dia aparece como feriado", () => {
    const [kg] = formatServices({ ...goiania, is_holiday: true, holiday_name: "Finados", weekday: 1 });
    expect(kg!.hoje!.dia).toBe("feriado (Finados)");
  });
});

describe("valor numa data", () => {
  const rules = goiania.services[0]!.rules;
  it("dia da semana", () => {
    expect(priceOnDate(rules, 2, false)).toBe(89.9);
    expect(priceOnDate(rules, 6, false)).toBe(109.9);
  });
  it("feriado usa a regra de feriado quando existe", () => {
    expect(priceOnDate(rules, 3, true)).toBe(109.9);
  });
  it("feriado sem regra cai no dia da semana", () => {
    expect(priceOnDate(goiania.services[1]!.rules, 3, true)).toBe(39.9);
  });
  it("dia sem regra devolve nulo", () => {
    expect(priceOnDate(rules.slice(0, 1), 0, false)).toBeNull();
  });
});
