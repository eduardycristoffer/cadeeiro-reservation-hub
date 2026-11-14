import { describe, expect, it } from "vitest";
import { SITE_URL, publicOrigin } from "@/lib/site";
import { ownLinkFromAuthUrl } from "@/lib/invite-link";

const TOKEN = "c533d6e13aa5b6ef4897fc34a2fad5929961fc2ebf8617673ddbfa16";

describe("endereço público", () => {
  it("troca hospedagem técnica pelo domínio oficial", () => {
    expect(publicOrigin("https://candeeiro.lovable.app")).toBe(SITE_URL);
    expect(publicOrigin("https://id-preview--abc.lovable.app")).toBe(SITE_URL);
    expect(publicOrigin("https://xyz.supabase.co")).toBe(SITE_URL);
    expect(publicOrigin(null)).toBe(SITE_URL);
  });
  it("mantém o domínio oficial e localhost", () => {
    expect(publicOrigin("https://candeeiro.tryade.com.br/admin")).toBe("https://candeeiro.tryade.com.br");
    expect(publicOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("link do e-mail de acesso", () => {
  const supa = (type: string) => `https://ibnvruvnyuzrvayodcfy.supabase.co/auth/v1/verify?redirect_to=https%3A%2F%2Fcandeeiro.tryade.com.br%2Fredefinir-senha&token=${TOKEN}&type=${type}`;
  it("senha: vai para a página do painel, sem supabase", () => {
    const l = ownLinkFromAuthUrl(SITE_URL, supa("recovery"));
    expect(l).toBe(`${SITE_URL}/redefinir-senha?token_hash=${TOKEN}&type=recovery`);
    expect(l).not.toMatch(/supabase|lovable/i);
  });
  it("convite e link de acesso vão para o primeiro acesso", () => {
    expect(ownLinkFromAuthUrl(SITE_URL, supa("invite"))).toBe(`${SITE_URL}/primeiro-acesso?token_hash=${TOKEN}&type=invite`);
    expect(ownLinkFromAuthUrl(SITE_URL, supa("magiclink"))).toContain("/primeiro-acesso");
  });
  it("link sem token ou tipo desconhecido não vira link do painel", () => {
    expect(ownLinkFromAuthUrl(SITE_URL, "https://x.supabase.co/auth/v1/verify?type=recovery")).toBeNull();
    expect(ownLinkFromAuthUrl(SITE_URL, supa("admin"))).toBeNull();
    expect(ownLinkFromAuthUrl(SITE_URL, null)).toBeNull();
  });
});
