import { describe, expect, it } from "vitest";
import {
  MAX_PEOPLE, QUICK_PEOPLE, isValidFullName, parsePeople, pessoas, quickLabel, sanitizeCampaign, serviceFromSlug, serviceSlug, upcomingDays,
} from "@/lib/reserva";
import { OCCASIONS, OCCASION_LABEL, SERVICES, SERVICE_LABEL } from "@/lib/reservations";

describe("link de campanha", () => {
  it("lê o rodízio do parâmetro", () => {
    expect(serviceFromSlug("carnes")).toBe("rodizio_carnes");
    expect(serviceFromSlug(" PIZZA ")).toBe("rodizio_pizza");
    expect(serviceFromSlug("sushi")).toBeUndefined();
    expect(serviceFromSlug(undefined)).toBeUndefined();
    expect(serviceFromSlug(7)).toBeUndefined();
  });
  it("validação da URL é idempotente (o roteador revalida o valor já normalizado)", () => {
    for (const raw of ["carnes", " PIZZA "]) {
      const once = serviceSlug(raw);
      expect(serviceSlug(once)).toBe(once);
    }
    for (const raw of ["Black Friday 2026", "a_b-c", "x".repeat(200)]) {
      const once = sanitizeCampaign(raw);
      expect(sanitizeCampaign(once)).toBe(once);
    }
    expect(serviceSlug("rodizio_carnes")).toBeUndefined();
  });
  it("normaliza a campanha para o formato do banco", () => {
    const ok = /^[a-z0-9_-]{1,60}$/;
    expect(sanitizeCampaign("Black Friday 2026")).toBe("black-friday-2026");
    expect(sanitizeCampaign("Promoção Dia das Mães!")).toBe("promocao-dia-das-maes");
    expect(sanitizeCampaign("a_b-c")).toBe("a_b-c");
    expect(sanitizeCampaign("  ")).toBeUndefined();
    expect(sanitizeCampaign("!!!")).toBeUndefined();
    expect(sanitizeCampaign({})).toBeUndefined();
    expect(sanitizeCampaign("x".repeat(200))).toMatch(ok);
    expect(sanitizeCampaign("x".repeat(200))!.length).toBe(60);
    for (const s of ["../etc/passwd", "<script>", "a b", "Ç"]) {
      const c = sanitizeCampaign(s);
      if (c) expect(c).toMatch(ok);
    }
  });
});

describe("quantidade de pessoas", () => {
  it("aceita só dígitos e limita a 200", () => {
    expect(parsePeople("")).toBe(0);
    expect(parsePeople("abc")).toBe(0);
    expect(parsePeople("12")).toBe(12);
    expect(parsePeople("1a2")).toBe(12);
    expect(parsePeople("999")).toBe(MAX_PEOPLE);
    expect(parsePeople("0004")).toBe(4);
  });
  it("atalhos: 5, 10, 20, +30, +100", () => {
    expect(QUICK_PEOPLE.map(quickLabel)).toEqual(["5", "10", "20", "+30", "+100"]);
  });
  it("singular e plural", () => {
    expect(pessoas(1)).toBe("1 pessoa");
    expect(pessoas(4)).toBe("4 pessoas");
  });
});

describe("próximos dias", () => {
  it("começa hoje e avança um dia por vez, inclusive na virada do mês", () => {
    const days = upcomingDays(new Date(2026, 9, 30), 4);
    expect(days.map((d) => `${d.getMonth() + 1}/${d.getDate()}`)).toEqual(["10/30", "10/31", "11/1", "11/2"]);
  });
});

describe("nome", () => {
  it("exige nome e sobrenome", () => {
    expect(isValidFullName("Maria")).toBe(false);
    expect(isValidFullName("Maria Silva")).toBe(true);
    expect(isValidFullName("  Maria   Silva ")).toBe(true);
  });
});

describe("rótulos compartilhados com o painel", () => {
  it("todo rodízio e toda ocasião tem rótulo", () => {
    for (const s of SERVICES) expect(SERVICE_LABEL[s.id]).toBe(s.label);
    for (const o of OCCASIONS) expect(OCCASION_LABEL[o.id]).toBe(o.label);
  });
  it("só aniversário e comemoração perguntam quem está comemorando", () => {
    expect(OCCASIONS.filter((o) => o.asksWho).map((o) => o.id)).toEqual(["aniversario", "comemoracao"]);
  });
});
