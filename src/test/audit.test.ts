import { describe, expect, it } from "vitest";
import { actorLabel, assignableRoles, changedFields, sentence, toCsv } from "@/lib/audit";

const base = { id: "1", created_at: "2026-11-12T21:42:00Z", before: null, after: null, note: null };

describe("histórico", () => {
  it("frase com pessoa, papel, ação, protocolo e hora de Brasília", () => {
    expect(sentence({ ...base, actor_name: "Ana", actor_role: "gestor", source: "painel", action: "reserva.aprovada", note: "CAD-1234" }))
      .toBe("Ana (Gestor) aprovou a reserva CAD-1234 às 18:42");
  });
  it("sem usuário mostra a origem", () => {
    expect(actorLabel({ actor_name: null, actor_role: null, source: "sdr_whatsapp" })).toBe("Atendente do WhatsApp");
    expect(actorLabel({ actor_name: null, actor_role: null, source: "landing_page" })).toBe("Cliente pelo site");
  });
  it("antes/depois ignora carimbos de data", () => {
    expect(changedFields({ status: "pendente", updated_at: "a" }, { status: "confirmada", updated_at: "b" }))
      .toEqual([{ key: "status", from: "pendente", to: "confirmada" }]);
  });
  it("gestor não pode atribuir Super Admin", () => {
    expect(assignableRoles(false)).not.toContain("super_admin");
    expect(assignableRoles(true)).toContain("super_admin");
  });
  it("CSV escapa ponto e vírgula", () => {
    const csv = toCsv([{ ...base, actor_name: "A;B", actor_role: null, source: "painel", action: "login" }]);
    expect(csv).toContain('"A;B"');
  });
});
