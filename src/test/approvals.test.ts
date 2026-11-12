import { describe, expect, it } from "vitest";
import { REJECT_REASONS, UNDO_MS, rejectNote, sortPending } from "@/lib/approvals";

describe("aprovações", () => {
  it("janela de desfazer é de 8 segundos", () => { expect(UNDO_MS).toBe(8000); });
  it("motivos rápidos de recusa", () => {
    expect([...REJECT_REASONS]).toEqual(["Sem mesa disponível", "Horário indisponível", "Pediu cancelamento", "Outro"]);
  });
  it("nota de recusa nunca é vazia e inclui o complemento", () => {
    expect(rejectNote("Sem mesa disponível")).toBe("Recusada: Sem mesa disponível");
    expect(rejectNote("Outro", " lotado ")).toBe("Recusada: Outro — lotado");
    expect(rejectNote("")).toBe("Recusada: Outro");
  });
  it("mais próximas primeiro; empate pela mais antiga", () => {
    const r = sortPending([
      { id: "c", reservation_date: "2026-11-14", reservation_time: "19:00", created_at: "2026-11-01" },
      { id: "b", reservation_date: "2026-11-13", reservation_time: "20:00", created_at: "2026-11-02" },
      { id: "a", reservation_date: "2026-11-13", reservation_time: "20:00", created_at: "2026-11-01" },
    ]);
    expect(r.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
