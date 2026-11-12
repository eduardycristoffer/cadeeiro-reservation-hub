import { describe, expect, it } from "vitest";
import { pctChange, toCsvTable } from "@/lib/csv";
import { PRIORITY, sacStatusLabel, typeLabel } from "@/lib/sac";

describe("CSV dos relatórios", () => {
  it("usa BOM, ponto e vírgula e data dd/mm/aaaa HH:mm de Brasília", () => {
    const csv = toCsvTable(["quando", "n"], [["2026-11-12T21:42:00Z", 1.5]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("quando;n");
    expect(csv).toContain("12/11/2026 18:42;1,5");
  });
  it("data sem hora vira dd/mm/aaaa", () => {
    expect(toCsvTable(["d"], [["2026-01-05"]])).toContain("05/01/2026");
  });
  it("variação % e sem base", () => {
    expect(pctChange(15, 10)).toBe(50);
    expect(pctChange(5, 0)).toBeNull();
  });
});

describe("SAC", () => {
  it("nomes de status e prioridade pedidos", () => {
    expect(sacStatusLabel("aberto")).toBe("Novo");
    expect(sacStatusLabel("encerrado")).toBe("Sem solução");
    expect(PRIORITY.media).toBe("Normal");
    expect(PRIORITY.urgente).toBe("Crítica");
  });
  it("categoria antiga do SDR aparece legível", () => {
    expect(typeLabel(null, "reclamacao")).toBe("Reclamação");
    expect(typeLabel("cobranca")).toBe("Cobrança");
  });
});
