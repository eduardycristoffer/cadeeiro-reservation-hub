import { describe, expect, it } from "vitest";
import { ageLabel, countByStatus, isStale } from "@/lib/leads";

const now = new Date("2026-11-12T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60000).toISOString();

describe("leads do WhatsApp", () => {
  it("rótulo de idade", () => {
    expect(ageLabel(ago(0), now)).toBe("agora");
    expect(ageLabel(ago(5), now)).toBe("há 5 min");
    expect(ageLabel(ago(180), now)).toBe("há 3 h");
    expect(ageLabel(ago(60 * 48), now)).toBe("há 2 d");
  });
  it("só destaca lead novo parado há mais de 15 min", () => {
    expect(isStale({ status: "novo", created_at: ago(20) }, now)).toBe(true);
    expect(isStale({ status: "novo", created_at: ago(10) }, now)).toBe(false);
    expect(isStale({ status: "em_atendimento", created_at: ago(300) }, now)).toBe(false);
  });
  it("conta por status", () => {
    expect(countByStatus([{ status: "novo" }, { status: "novo" }, { status: "reservou" }])).toEqual({ todos: 3, novo: 2, em_atendimento: 0, reservou: 1, perdido: 0 });
  });
});
