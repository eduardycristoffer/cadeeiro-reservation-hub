import { describe, expect, it } from "vitest";
import { buildWaUrl, parseWaLeadResult, pickUtm } from "@/lib/whatsapp";
import { CITIES, citySlug, servicesForCity } from "@/lib/reserva";
import { isValidPixelId } from "@/lib/pixel";
import { SERVICES } from "@/lib/reservations";

describe("whatsapp", () => {
  it("monta o link wa.me com o texto codificado", () => {
    expect(buildWaUrl("5562998396558", "Olá! Meu nome é Ana.")).toBe("https://wa.me/5562998396558?text=Ol%C3%A1!%20Meu%20nome%20%C3%A9%20Ana.");
    expect(buildWaUrl("+55 (62) 99839-6558", "oi")).toBe("https://wa.me/5562998396558?text=oi");
  });
  it("sem número válido não há link", () => {
    expect(buildWaUrl(null, "oi")).toBeNull();
    expect(buildWaUrl("", "oi")).toBeNull();
    expect(buildWaUrl("12345", "oi")).toBeNull();
  });
  it("pickUtm guarda só parâmetros conhecidos e curtos", () => {
    expect(pickUtm("?utm_source=instagram&utm_campaign=black-friday&x=1&fbclid=abc")).toEqual({ utm_source: "instagram", utm_campaign: "black-friday", fbclid: "1" });
    expect(pickUtm("")).toBeNull();
    expect(pickUtm("?utm_source=" + "a".repeat(200))?.["utm_source"]).toHaveLength(80);
  });
  it("parseWaLeadResult tolera resposta incompleta", () => {
    expect(parseWaLeadResult(null)).toBeNull();
    expect(parseWaLeadResult({})).toBeNull();
    expect(parseWaLeadResult({ lead_id: "1", whatsapp: null, message: "oi" })).toEqual({ lead_id: "1", whatsapp: null, message: "oi", unit_name: null });
    expect(parseWaLeadResult({ lead_id: "1", whatsapp: "5562998396558", message: "oi", unit_name: "Goiânia" })?.whatsapp).toBe("5562998396558");
  });
});

describe("cidades da página inicial", () => {
  it("Goiânia: quilo + pizza. Anápolis: carnes + pizza", () => {
    expect(servicesForCity("goiania")).toEqual(["almoco_quilo", "rodizio_pizza"]);
    expect(servicesForCity("anapolis")).toEqual(["rodizio_carnes", "rodizio_pizza"]);
  });
  it("cidade desconhecida ou ausente mostra todos os serviços", () => {
    expect(servicesForCity(undefined)).toHaveLength(SERVICES.length);
    expect(servicesForCity("curitiba")).toHaveLength(SERVICES.length);
  });
  it("citySlug aceita acento/maiúscula e é idempotente", () => {
    for (const raw of ["Goiânia", " ANAPOLIS ", "goiania", "Anápolis"]) {
      const once = citySlug(raw);
      expect(once).toBeDefined();
      expect(citySlug(once)).toBe(once);
    }
    expect(citySlug("x")).toBeUndefined();
    expect(citySlug(3)).toBeUndefined();
  });
  it("todo serviço das cidades existe em SERVICES", () => {
    const ids = SERVICES.map((s) => s.id) as string[];
    for (const c of CITIES) for (const s of c.services) expect(ids).toContain(s);
  });
});

describe("pixel", () => {
  it("aceita só IDs numéricos de 6 a 20 dígitos", () => {
    expect(isValidPixelId("123456789012345")).toBe(true);
    expect(isValidPixelId("12345")).toBe(false);
    expect(isValidPixelId("1234abc")).toBe(false);
    expect(isValidPixelId("'); alert(1);//")).toBe(false);
  });
});
