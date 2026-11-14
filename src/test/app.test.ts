import { describe, expect, it } from "vitest";
import { deviceLabel, installPageUrl, installPlan, parseUserAgent, pushSupport, seenAgo, whatsappShareUrl } from "@/lib/app";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphoneOld: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1",
  iphoneInsta: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.12.108",
  ipadAsMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0",
  androidWebview: "Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.0.0 Mobile Safari/537.36",
  winChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
  winFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};
const plan = (ua: string, o: Partial<{ standalone: boolean; canPrompt: boolean }> = {}, touch = 0) => installPlan(parseUserAgent(ua, touch), { standalone: false, canPrompt: false, ...o });

describe("parseUserAgent", () => {
  it("reconhece sistema e navegador", () => {
    expect(parseUserAgent(UA.iphoneSafari)).toMatchObject({ os: "ios", browser: "safari", iosMajor: 17, iosMinor: 4, mobile: true, inApp: false });
    expect(parseUserAgent(UA.iphoneChrome)).toMatchObject({ os: "ios", browser: "chrome" });
    expect(parseUserAgent(UA.androidChrome)).toMatchObject({ os: "android", browser: "chrome", mobile: true });
    expect(parseUserAgent(UA.androidSamsung)).toMatchObject({ os: "android", browser: "samsung" });
    expect(parseUserAgent(UA.androidFirefox)).toMatchObject({ os: "android", browser: "firefox" });
    expect(parseUserAgent(UA.winChrome)).toMatchObject({ os: "windows", browser: "chrome", mobile: false });
    expect(parseUserAgent(UA.winEdge)).toMatchObject({ os: "windows", browser: "edge" });
    expect(parseUserAgent(UA.macSafari)).toMatchObject({ os: "mac", browser: "safari" });
  });
  it("iPad que se apresenta como Mac conta como iOS", () => {
    expect(parseUserAgent(UA.ipadAsMac, 5).os).toBe("ios");
    expect(parseUserAgent(UA.ipadAsMac, 0).os).toBe("mac");
  });
  it("detecta navegador embutido em outros aplicativos", () => {
    expect(parseUserAgent(UA.iphoneInsta).inApp).toBe(true);
    expect(parseUserAgent(UA.androidWebview).inApp).toBe(true);
    expect(parseUserAgent(UA.androidChrome).inApp).toBe(false);
  });
});

describe("installPlan", () => {
  it("já instalado não manda instalar de novo", () => {
    expect(plan(UA.androidChrome, { standalone: true }).mode).toBe("installed");
    expect(plan(UA.iphoneSafari, { standalone: true }).mode).toBe("installed");
  });
  it("usa o botão do navegador quando ele está disponível", () => {
    expect(plan(UA.androidChrome, { canPrompt: true }).mode).toBe("prompt");
    expect(plan(UA.winChrome, { canPrompt: true })).toMatchObject({ mode: "prompt", title: "Instalar no computador" });
  });
  it("iPhone: passo a passo do Safari, de outro navegador e iOS antigo", () => {
    const s = plan(UA.iphoneSafari);
    expect(s.mode).toBe("manual");
    expect(s.steps.join(" ")).toMatch(/Adicionar à Tela de Início/);
    expect(plan(UA.iphoneChrome).note).toMatch(/Safari/);
    expect(plan(UA.iphoneOld).mode).toBe("unsupported");
  });
  it("dentro do Instagram pede para abrir no navegador, nos dois sistemas", () => {
    expect(plan(UA.iphoneInsta)).toMatchObject({ mode: "open-outside" });
    expect(plan(UA.iphoneInsta).steps[1]).toMatch(/Safari/);
    expect(plan(UA.androidWebview).steps[1]).toMatch(/Chrome/);
  });
  it("Android e computador sem o botão têm passo a passo", () => {
    expect(plan(UA.androidChrome).steps.join(" ")).toMatch(/Instalar app/);
    expect(plan(UA.androidFirefox).steps.join(" ")).toMatch(/Instalar/);
    expect(plan(UA.winEdge).mode).toBe("manual");
    expect(plan(UA.macSafari).steps.join(" ")).toMatch(/Dock/);
    expect(plan(UA.winFirefox).mode).toBe("unsupported");
  });
});

describe("pushSupport", () => {
  const all = { hasPush: true, hasNotification: true, hasServiceWorker: true, standalone: false };
  it("iPhone só depois de instalado", () => {
    expect(pushSupport(parseUserAgent(UA.iphoneSafari), all)).toBe("ios-instalar");
    expect(pushSupport(parseUserAgent(UA.iphoneSafari), { ...all, standalone: true })).toBe("ok");
    expect(pushSupport(parseUserAgent(UA.iphoneOld), { ...all, standalone: true })).toBe("ios-antigo");
  });
  it("Android e computador dependem do navegador", () => {
    expect(pushSupport(parseUserAgent(UA.androidChrome), all)).toBe("ok");
    expect(pushSupport(parseUserAgent(UA.winChrome), { ...all, hasPush: false })).toBe("navegador");
    expect(pushSupport(parseUserAgent(UA.androidWebview), all)).toBe("dentro-de-app");
  });
});

describe("textos", () => {
  it("rótulo do aparelho", () => {
    expect(deviceLabel(parseUserAgent(UA.androidChrome), true)).toBe("Android · Chrome (app)");
    expect(deviceLabel(parseUserAgent(UA.winEdge), false)).toBe("Windows · Edge");
  });
  it("endereço e compartilhamento", () => {
    expect(installPageUrl("https://painel.exemplo.com/admin?x=1")).toBe("https://painel.exemplo.com/app");
    const u = whatsappShareUrl("https://painel.exemplo.com/app");
    expect(u.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(u)).toContain("https://painel.exemplo.com/app");
  });
  it("visto por último", () => {
    const now = Date.parse("2026-11-13T12:00:00Z");
    expect(seenAgo("2026-11-13T11:59:30Z", now)).toBe("agora há pouco");
    expect(seenAgo("2026-11-13T11:30:00Z", now)).toBe("há 30 min");
    expect(seenAgo("2026-11-13T09:00:00Z", now)).toBe("há 3 h");
    expect(seenAgo("2026-11-12T10:00:00Z", now)).toBe("ontem");
    expect(seenAgo("2026-11-08T12:00:00Z", now)).toBe("há 5 dias");
    expect(seenAgo(null, now)).toBe("—");
  });
});
