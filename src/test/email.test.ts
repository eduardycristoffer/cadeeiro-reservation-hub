import { describe, expect, it } from "vitest";
import { escapeHtml, isValidEmail, oneLine, panelUrl, parseEmailList, renderAlertEmail, renderInviteEmail } from "@/lib/email";

describe("e-mail: validações", () => {
  it.each(["a@b.co", "nome.sobrenome+tag@dominio.com.br"])("aceita %s", (v) => expect(isValidEmail(v)).toBe(true));
  it.each(["", "sem-arroba", "a@b", "a b@c.com", "@x.com", 5, null])("recusa %s", (v) => expect(isValidEmail(v)).toBe(false));
  it("lista: separa por vírgula, ponto e vírgula e espaço; sem repetidos", () => {
    expect(parseEmailList("A@x.com, b@x.com; a@x.com\nc@x.com")).toEqual({ emails: ["a@x.com", "b@x.com", "c@x.com"], invalid: [] });
  });
  it("lista: separa o que não é e-mail", () => {
    expect(parseEmailList("ok@x.com, xx, y@z")).toEqual({ emails: ["ok@x.com"], invalid: ["xx", "y@z"] });
  });
  it("lista vazia", () => expect(parseEmailList("  ")).toEqual({ emails: [], invalid: [] }));
});

describe("e-mail: segurança do conteúdo", () => {
  it("escapa HTML", () => expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;"));
  it("assunto em uma linha", () => expect(oneLine("Oi\r\nBcc: x@y.com")).toBe("Oi Bcc: x@y.com"));
  it("alerta com HTML malicioso não injeta tag", () => {
    const m = renderAlertEmail({ subject: "[Candeeiro] <script>x</script>", body: "<img src=x onerror=alert(1)> · Motivo: ok", url: null });
    expect(m.html).not.toContain("<script>"); expect(m.html).not.toContain("<img"); expect(m.html).toContain("&lt;img");
  });
});

describe("panelUrl", () => {
  it("monta o endereço do painel", () => expect(panelUrl("https://app.exemplo.com.br/qualquer", "/admin/aprovacoes")).toBe("https://app.exemplo.com.br/admin/aprovacoes"));
  it.each([
    ["http://exemplo.com", "/admin/crm"], ["javascript:alert(1)", "/admin"], ["https://x.com", "/fora"], ["https://x.com", "/admin/../etc"], [null, "/admin"], ["https://x.com", null], ["lixo", "/admin"],
  ])("recusa %s %s", (b, p) => expect(panelUrl(b, p)).toBeNull());
  it("aceita http só em localhost", () => expect(panelUrl("http://localhost:3000", "/admin")).toBe("http://localhost:3000/admin"));
});

describe("renderAlertEmail", () => {
  const m = renderAlertEmail({ subject: "[Candeeiro] Nova reserva para aprovar", body: "Maria · 4 pessoas · 14/11 às 20:00 · Candeeiro Goiânia", url: "https://x.com/admin/aprovacoes" });
  it("assunto", () => expect(m.subject).toBe("[Candeeiro] Nova reserva para aprovar"));
  it("texto tem uma informação por linha e o link", () => {
    expect(m.text).toContain("Maria\n4 pessoas\n14/11 às 20:00\nCandeeiro Goiânia"); expect(m.text).toContain("Abrir no painel: https://x.com/admin/aprovacoes");
  });
  it("HTML tem o botão", () => { expect(m.html).toContain('href="https://x.com/admin/aprovacoes"'); expect(m.html).toContain("Abrir no painel"); });
  it("sem endereço do painel, sem botão", () => {
    const n = renderAlertEmail({ subject: "[Candeeiro] X", body: "y", url: null });
    expect(n.html).not.toContain("Abrir no painel"); expect(n.text).not.toContain("Abrir no painel");
  });
});

describe("renderInviteEmail", () => {
  const m = renderInviteEmail({ name: "Ana Paula Souza", link: "https://x.supabase.co/auth/v1/verify?token=abc&type=invite", inviter: "Dono" });
  it("cumprimenta pelo primeiro nome e diz quem convidou", () => { expect(m.text).toContain("Olá, Ana!"); expect(m.text).toContain("Dono convidou você"); });
  it("o link vai inteiro no texto e escapado no HTML", () => {
    expect(m.text).toContain("token=abc&type=invite"); expect(m.html).toContain("token=abc&amp;type=invite");
  });
  it("sem convidante usa texto neutro", () => expect(renderInviteEmail({ name: "Ana", link: "https://x.com/a" }).text).toContain("Você foi convidado(a)"));
});
