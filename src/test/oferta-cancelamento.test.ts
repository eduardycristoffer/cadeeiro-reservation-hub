import { describe, expect, it } from "vitest";
import { OFERTA, ofertaAceita, cidadeValida, servicoValido, whatsappDestino } from "@/lib/oferta";
import { cancellationNote, validReason } from "@/lib/approvals";
import { todaySaoPaulo } from "@/lib/reservations";

describe("oferta por cidade", () => {
  it("Hoje respeita São Paulo na virada UTC", () => {
    expect(todaySaoPaulo(new Date("2026-11-13T00:51:00Z"))).toBe("2026-11-12");
  });
  it("Goiânia oferece apenas quilo e pizza", () => {
    expect(OFERTA.goiania.servicos).toEqual(["almoco_quilo", "rodizio_pizza"]);
    expect(ofertaAceita("goiania", "rodizio_carnes")).toBe(false);
  });
  it("Anápolis oferece apenas carnes e pizza", () => {
    expect(OFERTA.anapolis.servicos).toEqual(["rodizio_carnes", "rodizio_pizza"]);
    expect(ofertaAceita("anapolis", "almoco_quilo")).toBe(false);
  });
  it("URLs normalizadas continuam válidas", () => {
    expect(cidadeValida(cidadeValida("goiania"))).toBe("goiania");
    expect(servicoValido(servicoValido("almoco_quilo"))).toBe("almoco_quilo");
  });
  it("sem número não redireciona", () => {
    expect(whatsappDestino(null, "Maria Silva", "goiania")).toBeNull();
    expect(whatsappDestino("", "Maria Silva", "anapolis")).toBeNull();
  });
  it("WhatsApp inclui nome e cidade", () => {
    expect(
      decodeURIComponent(whatsappDestino("+5562999999999", "Maria Silva", "goiania") ?? ""),
    ).toContain("Sou Maria Silva");
    expect(
      decodeURIComponent(whatsappDestino("+5562999999999", "Maria Silva", "anapolis") ?? ""),
    ).toContain("Anápolis");
  });
});
describe("motivo obrigatório", () => {
  it("não aceita motivo ausente", () => {
    expect(validReason("", "")).toBe(false);
    expect(() => cancellationNote("")).toThrow();
  });
  it("Outro exige detalhe", () => {
    expect(validReason("Outro", "  ")).toBe(false);
    expect(validReason("Outro", "Alergia")).toBe(true);
    expect(() => cancellationNote("Outro")).toThrow();
  });
  it("padroniza cancelamento", () => {
    expect(cancellationNote("Cliente pediu cancelamento")).toBe(
      "Cancelada: Cliente pediu cancelamento",
    );
    expect(cancellationNote("Outro", " mudança de planos ")).toBe(
      "Cancelada: Outro — mudança de planos",
    );
  });
  it("preserva prefixo de recusa", () => {
    expect(cancellationNote("Sem mesa disponível", "", true)).toBe("Recusada: Sem mesa disponível");
  });
});
