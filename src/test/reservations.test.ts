import { describe, expect, it } from "vitest";
import { canConfirmLargeGroup, canTransition, periodRange, waLink } from "@/lib/reservations";

describe("transições de status", () => {
  it("pendente pode virar confirmada ou cancelada", () => {
    expect(canTransition("pendente", "confirmada")).toBe(true);
    expect(canTransition("pendente", "cancelada")).toBe(true);
    expect(canTransition("pendente", "concluida")).toBe(false);
  });
  it("confirmada pode virar concluída, não compareceu ou cancelada", () => {
    expect(canTransition("confirmada", "concluida")).toBe(true);
    expect(canTransition("confirmada", "nao_compareceu")).toBe(true);
    expect(canTransition("confirmada", "cancelada")).toBe(true);
    expect(canTransition("confirmada", "pendente")).toBe(false);
  });
  it("status finais não mudam", () => {
    expect(canTransition("cancelada", "confirmada")).toBe(false);
    expect(canTransition("concluida", "cancelada")).toBe(false);
  });
  it("grupo grande só é confirmado por quem gerencia a unidade", () => {
    expect(canConfirmLargeGroup(true, false)).toBe(false);
    expect(canConfirmLargeGroup(true, true)).toBe(true);
    expect(canConfirmLargeGroup(false, false)).toBe(true);
  });
});

describe("períodos", () => {
  const wed = new Date(2026, 9, 28); // quarta, 28/10/2026
  it("semana vai de segunda a domingo", () => {
    expect(periodRange("semana", wed)).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });
  it("amanhã", () => {
    expect(periodRange("amanha", wed)).toEqual({ from: "2026-10-29", to: "2026-10-29" });
  });
  it("mês", () => {
    expect(periodRange("mes", wed)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
});

it("link do WhatsApp usa só dígitos", () => {
  expect(waLink("+5511987654321")).toBe("https://wa.me/5511987654321");
});
