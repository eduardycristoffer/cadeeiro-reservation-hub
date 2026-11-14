import { describe, expect, it } from "vitest";
import { IMPORT_TEMPLATE, isValidBrPhone, parseContactsCsv, sourceLabel, splitCsvLine } from "@/lib/contacts";

describe("parseContactsCsv", () => {
  it("lê o modelo de importação", () => {
    const r = parseContactsCsv(IMPORT_TEMPLATE);
    expect(r.problems).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ nome: "Maria Souza", telefone: "(62) 99999-0000", aceita_whatsapp: "sim" });
  });
  it("aceita vírgula, aspas e cabeçalhos com outros nomes", () => {
    const r = parseContactsCsv('Cliente,Celular,Obs\n"Souza, João",62988887777,"gosta de pizza, sem cebola"');
    expect(r.problems).toEqual([]);
    expect(r.rows[0]).toMatchObject({ nome: "Souza, João", observacoes: "gosta de pizza, sem cebola" });
  });
  it("aponta a linha de cada problema e segue com as boas", () => {
    const r = parseContactsCsv("Nome;Telefone;E-mail\nAna;62991110001;a@x.com\nB;62991110002;\nCarla;123;\nDiego;62991110003;sem-arroba\nEva;(62) 99111-0001;");
    expect(r.rows.map((x) => x.nome)).toEqual(["Ana"]);
    expect(r.problems.map((p) => p.linha)).toEqual([3, 4, 5, 6]);
    expect(r.problems[3]!.erro).toMatch(/repetido/);
  });
  it("exige as colunas Nome e Telefone", () => {
    expect(parseContactsCsv("Nome;Email\nAna;a@x.com").problems[0]!.erro).toMatch(/Nome.*Telefone/);
    expect(parseContactsCsv("só uma linha").problems).toHaveLength(1);
  });
  it("recusa arquivo grande demais", () => {
    const body = Array.from({ length: 5001 }, (_, i) => `Pessoa ${i};6299${String(1000000 + i).slice(-7)}`).join("\n");
    expect(parseContactsCsv("Nome;Telefone\n" + body).problems[0]!.erro).toMatch(/Máximo/);
  });
});

describe("telefone e utilitários", () => {
  it("valida como o banco", () => {
    expect(isValidBrPhone("(62) 99999-0000")).toBe(true);
    expect(isValidBrPhone("+55 62 3333-4444")).toBe(true);
    expect(isValidBrPhone("0000")).toBe(false);
    expect(isValidBrPhone("(02) 99999-0000")).toBe(false);
  });
  it("divide linha com aspas", () => {
    expect(splitCsvLine('a;"b;c";"d ""e"""', ";")).toEqual(["a", "b;c", 'd "e"']);
  });
  it("rótulo de origem", () => { expect(sourceLabel("importacao")).toBe("Importação"); expect(sourceLabel("x")).toBe("x"); });
});
