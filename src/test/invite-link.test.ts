import { describe, expect, it } from "vitest";
import { buildInviteLink, parseInviteParams } from "@/lib/invite-link";

const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c";

describe("buildInviteLink", () => {
  it("monta o link do painel com token e tipo", () => {
    expect(buildInviteLink("https://painel.exemplo.com", TOKEN, "invite")).toBe(`https://painel.exemplo.com/primeiro-acesso?token_hash=${TOKEN}&type=invite`);
  });
  it("ignora caminho e parâmetros da base", () => {
    expect(buildInviteLink("https://painel.exemplo.com/qualquer?x=1", TOKEN, "magiclink")).toBe(`https://painel.exemplo.com/primeiro-acesso?token_hash=${TOKEN}&type=magiclink`);
  });
  it("aceita http só em localhost", () => {
    expect(buildInviteLink("http://localhost:3000", TOKEN, "invite")).toContain("http://localhost:3000/primeiro-acesso");
    expect(buildInviteLink("http://painel.exemplo.com", TOKEN, "invite")).toBeNull();
  });
  it("recusa token estranho, tipo desconhecido e base inválida", () => {
    expect(buildInviteLink("https://painel.exemplo.com", "curto", "invite")).toBeNull();
    expect(buildInviteLink("https://painel.exemplo.com", `${TOKEN}&x=1`, "invite")).toBeNull();
    expect(buildInviteLink("https://painel.exemplo.com", TOKEN, "signup; drop")).toBeNull();
    expect(buildInviteLink("não é url", TOKEN, "invite")).toBeNull();
    expect(buildInviteLink("javascript:alert(1)", TOKEN, "invite")).toBeNull();
  });
});

describe("parseInviteParams", () => {
  it("lê token e tipo", () => {
    expect(parseInviteParams(`?token_hash=${TOKEN}&type=invite`)).toEqual({ tokenHash: TOKEN, type: "invite" });
    expect(parseInviteParams(`token_hash=${TOKEN}&type=magiclink`)).toEqual({ tokenHash: TOKEN, type: "magiclink" });
  });
  it("devolve null sem parâmetros ou com valores inválidos", () => {
    expect(parseInviteParams("")).toBeNull();
    expect(parseInviteParams(`?token_hash=${TOKEN}`)).toBeNull();
    expect(parseInviteParams("?token_hash=abc&type=invite")).toBeNull();
    expect(parseInviteParams(`?token_hash=${TOKEN}&type=admin`)).toBeNull();
  });
  it("ida e volta: o que o servidor monta a página entende", () => {
    const link = buildInviteLink("https://painel.exemplo.com", TOKEN, "recovery")!;
    expect(parseInviteParams(new URL(link).search)).toEqual({ tokenHash: TOKEN, type: "recovery" });
  });
});
