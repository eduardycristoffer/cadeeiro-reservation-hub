import { describe, expect, it } from "vitest";
import { isValidBrPhone, maskBrPhone } from "@/lib/format";

describe("telefone brasileiro", () => {
  it("aceita celular com DDD e 9 dígitos", () => {
    expect(isValidBrPhone("(11) 98765-4321")).toBe(true);
  });
  it("rejeita número sem DDD", () => {
    expect(isValidBrPhone("98765-4321")).toBe(false);
  });
  it("rejeita celular de 9 dígitos que não começa com 9", () => {
    expect(isValidBrPhone("11 88765 43210")).toBe(false);
  });
  it("aplica máscara", () => {
    expect(maskBrPhone("11987654321")).toBe("(11) 98765-4321");
  });
});
