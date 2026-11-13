import { describe, expect, it } from "vitest";
import {
  hasReviewLink, parseAudience, parseOverview, parseSettings, parseTemplates, previewTemplate, renderTemplate, reviewHost, reviewUrlProblem, settingsProblem, sinceLabel, unknownVars,
  OPT_OUT_FOOTER, REVIEW_DAYS, SEND_KIND_LABEL, TEMPLATE_INFO,
} from "@/lib/crm";

describe("renderTemplate (mesma regra do banco)", () => {
  it("troca variáveis", () => {
    expect(renderTemplate("Oi, {{nome}}! {{unidade}}", { nome: "Ana", unidade: "Goiânia" })).toBe("Oi, Ana! Goiânia");
  });
  it("some a linha inteira quando a variável está vazia", () => {
    const body = "Olá, {{nome}}.\nMotivo: {{motivo}}\nPodemos reagendar.";
    expect(renderTemplate(body, { nome: "Ana", motivo: "" })).toBe("Olá, Ana.\nPodemos reagendar.");
    expect(renderTemplate(body, { nome: "Ana", motivo: "Casa lotada" })).toBe("Olá, Ana.\nMotivo: Casa lotada\nPodemos reagendar.");
  });
  it("variável ausente ou só espaços também some", () => {
    expect(renderTemplate("a\nLink: {{link}}\nb", { link: "   " })).toBe("a\nb");
    expect(renderTemplate("a\nLink: {{link}}\nb", {})).toBe("a\nb");
  });
  it("não deixa mais de uma linha em branco seguida", () => {
    expect(renderTemplate("a\n\n\n\nb", {})).toBe("a\n\nb");
  });
  it("repete a mesma variável na linha", () => {
    expect(renderTemplate("{{nome}} e {{nome}}", { nome: "Ana" })).toBe("Ana e Ana");
  });
});

describe("previewTemplate", () => {
  it("marketing leva o rodapé de saída; confirmação não", () => {
    expect(previewTemplate("remarketing", "Oi, {{nome}}! Tem novidade {{link}}")).toContain(OPT_OUT_FOOTER);
    expect(previewTemplate("confirmacao", "Oi, {{nome}}! Reserva {{protocolo}} confirmada")).not.toContain(OPT_OUT_FOOTER);
  });
  it("não duplica o rodapé quando o texto já pede SAIR", () => {
    const t = previewTemplate("remarketing", "Oi {{nome}}, para sair responda SAIR");
    expect(t.match(/SAIR/g)).toHaveLength(1);
  });
  it("variável de reserva em modelo de marketing some a linha (igual ao envio real)", () => {
    expect(previewTemplate("reaver_inativo", "Oi, {{nome}}!\nSua reserva: {{protocolo}}\nVolte!")).not.toContain("CAD-");
  });
  it("cancelamento mostra o motivo; sem motivo a linha some", () => {
    const body = "Sua reserva foi cancelada.\nMotivo: {{motivo}}";
    expect(previewTemplate("cancelamento", body)).toContain("Motivo: Casa lotada");
    expect(previewTemplate("cancelamento", body, { motivo: "" })).toBe("Sua reserva foi cancelada.");
  });
});

describe("unknownVars", () => {
  it("aponta variáveis que o modelo não conhece", () => {
    expect(unknownVars("remarketing", "Oi {{nome}} {{protocolo}} {{xpto}}")).toEqual(["protocolo", "xpto"]);
    expect(unknownVars("confirmacao", "Oi {{nome}} {{protocolo}}")).toEqual([]);
  });
});

describe("settingsProblem", () => {
  const ok = parseSettings({});
  it("padrão é válido", () => expect(settingsProblem(ok)).toBeNull());
  it.each([
    [{ send_window_end: "08:00" }, "depois"], [{ daily_cap: 0 }, "limite"], [{ daily_cap: 1001 }, "limite"],
    [{ marketing_gap_days: 0 }, "intervalo"], [{ reaver_inativo_days: 10 }, "sumido"], [{ public_url: "http://x.com" }, "https"],
    [{ followup_pos_delay_hours: 100 }, "pós-visita"], [{ reaver_lead_hours: 0 }, "Lead"],
  ])("recusa %j", (patch, word) => {
    expect(settingsProblem({ ...ok, ...patch })).toContain(word);
  });
  it("aceita endereço https", () => expect(settingsProblem({ ...ok, public_url: "https://candeeiro.com.br" })).toBeNull());
});

describe("leitura do que vem do banco", () => {
  it("parseSettings corta segundos do horário e usa padrões", () => {
    const s = parseSettings({ send_window_start: "09:00:00", daily_cap: 50, followup_pos_enabled: true });
    expect(s.send_window_start).toBe("09:00"); expect(s.daily_cap).toBe(50); expect(s.followup_pos_enabled).toBe(true); expect(s.reaver_lead_enabled).toBe(false);
  });
  it("parseSettings tolera lixo", () => expect(parseSettings(null).daily_cap).toBe(80));
  it("parseOverview", () => {
    const o = parseOverview({ pending: 3, by_kind_7d: { remarketing: 5, x: "a" }, sent_today: "7" });
    expect(o.pending).toBe(3); expect(o.by_kind_7d).toEqual({ remarketing: 5, x: 0 }); expect(o.sent_today).toBe(0);
  });
  it("parseTemplates ignora chaves desconhecidas", () => {
    const t = parseTemplates([{ key: "confirmacao", body: "a", default_body: "b", is_custom: true }, { key: "outro", body: "x" }, null]);
    expect(t).toHaveLength(1); expect(t[0]?.is_custom).toBe(true);
  });
  it("parseTemplates com valor inválido devolve vazio", () => expect(parseTemplates(null)).toEqual([]));
  it("parseAudience", () => {
    const a = parseAudience({ total: 12, sample: [{ nome: "Ana", final: "1234" }, 5], max: 500 });
    expect(a).toEqual({ total: 12, sample: [{ nome: "Ana", final: "1234" }], max: 500 });
  });
});

describe("sinceLabel", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  it.each([
    ["2026-11-12T11:59:40Z", "agora"], ["2026-11-12T11:30:00Z", "há 30 min"], ["2026-11-12T08:00:00Z", "há 4 h"], ["2026-11-09T12:00:00Z", "há 3 d"],
  ])("%s", (iso, out) => expect(sinceLabel(iso, now)).toBe(out));
  it("vazio ou inválido", () => { expect(sinceLabel(null)).toBe("—"); expect(sinceLabel("x")).toBe("—"); });
});

describe("campanha de avaliação no Google", () => {
  it.each([
    "https://g.page/r/CabC123/review", "https://search.google.com/local/writereview?placeid=ChIJ123", "https://maps.app.goo.gl/AbC", "https://share.google/H50r74dqSvM6YCwXu",
    "https://www.google.com/maps/place/x", "https://www.google.com.br/maps", "https://g.co/kgs/abc", "  https://g.page/r/abc/review  ",
  ])("aceita %s", (u) => expect(reviewUrlProblem(u)).toBeNull());
  it.each([
    ["", "Cole"], ["http://g.page/r/abc", "https"], ["g.page/r/abc", "https"], ["https://g.page.evil.com/r/abc", "Google"], ["https://evil.com/g.page/r/abc", "Google"],
    ["https://g.page@evil.com/r", "Google"], ["https://google.com.evil.com/x", "Google"], ["https://facebook.com/x", "Google"], ["https://g.page/r/a b", "Google"],
    ["https://g.page/{{nome}}", "Google"], [`https://g.page/${"a".repeat(500)}`, "longo"],
  ])("recusa %j", (u, word) => expect(reviewUrlProblem(u)).toContain(word));

  it("o modelo conhece o link e mais nada de reserva", () => {
    expect(unknownVars("avaliacao_google", "Oi {{nome}} {{unidade}} {{cidade}} {{link_avaliacao}}")).toEqual([]);
    expect(unknownVars("avaliacao_google", "Oi {{nome}} {{protocolo}} {{link}}")).toEqual(["protocolo", "link"]);
    expect(unknownVars("remarketing", "Oi {{nome}} {{link_avaliacao}}")).toEqual(["link_avaliacao"]);
  });
  it("prévia leva o link escolhido e o rodapé de saída", () => {
    const t = previewTemplate("avaliacao_google", "Oi, {{nome}}! Avalie o {{unidade}}:\n{{link_avaliacao}}", { link_avaliacao: "https://g.page/r/xyz/review", unidade: "Candeeiro Anápolis" });
    expect(t).toContain("Avalie o Candeeiro Anápolis:\nhttps://g.page/r/xyz/review");
    expect(t).toContain(OPT_OUT_FOOTER);
    expect(t.match(/SAIR/g)).toHaveLength(1);
  });
  it("sem link a linha dele some, nunca sobra {{...}}", () => {
    expect(renderTemplate("Oi {{nome}}\nAvalie: {{link_avaliacao}}\nObrigado", { nome: "Ana" })).toBe("Oi Ana\nObrigado");
  });
  it("hasReviewLink exige a variável no texto", () => {
    expect(hasReviewLink("Avalie: {{link_avaliacao}}")).toBe(true);
    expect(hasReviewLink("Avalie pelo nosso link")).toBe(false);
    expect(hasReviewLink("Avalie: {{link}}")).toBe(false);
  });
  it("reviewHost mostra só o endereço curto", () => {
    expect(reviewHost("https://g.page/r/abc/review")).toBe("g.page");
    expect(reviewHost(null)).toBe("—");
    expect(reviewHost("lixo")).toBe("—");
  });
  it("tipo de envio e modelo existem na tela", () => {
    expect(SEND_KIND_LABEL["avaliacao_google"]).toBe("Avaliação Google");
    expect(TEMPLATE_INFO.avaliacao_google.marketing).toBe(true);
    expect(REVIEW_DAYS).toEqual({ min: 1, default: 14, max: 90 });
    const t = parseTemplates([{ key: "avaliacao_google", body: "Oi {{nome}} {{link_avaliacao}}", default_body: "x", is_custom: false }]);
    expect(t).toHaveLength(1);
  });
});
