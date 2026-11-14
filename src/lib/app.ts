// O app instalável: o que dá para fazer em cada aparelho/navegador e o passo a passo certo para cada um.
// Lógica pura (sem acesso ao navegador), para rodar igual no servidor, na tela e nos testes.

export type Os = "ios" | "android" | "windows" | "mac" | "linux" | "other";
export type Browser = "chrome" | "safari" | "firefox" | "edge" | "samsung" | "opera" | "other";
export type Env = { os: Os; browser: Browser; inApp: boolean; iosMajor: number | null; iosMinor: number | null; mobile: boolean };

/** Lê o user agent. `maxTouch` distingue iPad (que se apresenta como Mac) de um Mac de verdade. */
export function parseUserAgent(ua: string, maxTouch = 0): Env {
  const iPadAsMac = /Macintosh/.test(ua) && maxTouch > 1;
  const os: Os = /iPhone|iPad|iPod/.test(ua) || iPadAsMac ? "ios" : /Android/.test(ua) ? "android" : /Windows/.test(ua) ? "windows" : /Mac OS X|Macintosh/.test(ua) ? "mac" : /Linux|CrOS/.test(ua) ? "linux" : "other";
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|MicroMessenger|TikTok|BytedanceWebview|Snapchat|; wv\)|GSA\//.test(ua);
  const browser: Browser = /EdgA|EdgiOS|Edg\//.test(ua) ? "edge" : /OPR\/|OPiOS|Opera/.test(ua) ? "opera" : /SamsungBrowser/.test(ua) ? "samsung"
    : /Firefox|FxiOS/.test(ua) ? "firefox" : /CriOS|Chrome\//.test(ua) ? "chrome" : /Safari\//.test(ua) && /Version\//.test(ua) ? "safari" : "other";
  let iosMajor: number | null = null, iosMinor: number | null = null;
  if (os === "ios") {
    const m = /OS (\d+)[_.](\d+)/.exec(ua) ?? /Version\/(\d+)\.(\d+)/.exec(ua);
    if (m) { iosMajor = Number(m[1]); iosMinor = Number(m[2]); }
  }
  return { os, browser, inApp, iosMajor, iosMinor, mobile: os === "ios" || os === "android" };
}

const OS_LABEL: Record<Os, string> = { ios: "iPhone/iPad", android: "Android", windows: "Windows", mac: "Mac", linux: "Linux", other: "Aparelho" };
const BROWSER_LABEL: Record<Browser, string> = { chrome: "Chrome", safari: "Safari", firefox: "Firefox", edge: "Edge", samsung: "Samsung Internet", opera: "Opera", other: "Navegador" };

/** Nome curto para a lista de aparelhos: "Android · Chrome (app)". */
export function deviceLabel(env: Env, standalone: boolean): string {
  return `${OS_LABEL[env.os]} · ${BROWSER_LABEL[env.browser]}${standalone ? " (app)" : ""}`.slice(0, 80);
}

// ---------------------------------------------------------------------------------------------------------------------

export type InstallMode = "installed" | "prompt" | "manual" | "open-outside" | "unsupported";
export type InstallPlan = { mode: InstallMode; title: string; steps: string[]; note?: string };

const iosHasWebApps = (e: Env) => e.iosMajor === null || e.iosMajor > 16 || (e.iosMajor === 16 && (e.iosMinor ?? 0) >= 4);

/** O melhor caminho para instalar neste aparelho agora. `canPrompt` = o navegador já ofereceu o botão de instalar. */
export function installPlan(env: Env, o: { standalone: boolean; canPrompt: boolean }): InstallPlan {
  if (o.standalone) return { mode: "installed", title: "App instalado", steps: [] };

  if (env.inApp) {
    return {
      mode: "open-outside", title: "Abra no navegador do celular",
      steps: env.os === "ios"
        ? ["Toque em ⋯ ou no ícone de compartilhar, no canto da tela", "Escolha Abrir no Safari", "Depois volte aqui e siga os passos para instalar"]
        : ["Toque nos três pontinhos (⋮) no canto da tela", "Escolha Abrir no Chrome (ou Abrir no navegador)", "Depois volte aqui e toque em Baixar o app"],
      note: "Este link foi aberto dentro de outro aplicativo (Instagram, Facebook, WhatsApp…), que não deixa instalar.",
    };
  }

  if (env.os === "ios") {
    if (!iosHasWebApps(env)) {
      return { mode: "unsupported", title: "Atualize o iPhone para usar o app", steps: ["Abra Ajustes › Geral › Atualização de Software", "Instale a versão mais nova do iOS", "Volte aqui e instale o app"], note: "Esta versão do iOS não recebe os alertas do app." };
    }
    if (env.browser === "safari") {
      return { mode: "manual", title: "Instalar no iPhone", steps: ["Toque em Compartilhar (o quadrado com uma seta para cima, na barra de baixo)", "Role a lista e toque em Adicionar à Tela de Início", "Toque em Adicionar, no canto de cima", "Abra o app pelo ícone que apareceu na tela"] };
    }
    return { mode: "manual", title: "Instalar no iPhone", steps: ["Toque em Compartilhar (ou em ⋯ e depois Compartilhar)", "Escolha Adicionar à Tela de Início", "Toque em Adicionar", "Abra o app pelo ícone que apareceu na tela"], note: "Se não aparecer a opção, abra este endereço no Safari." };
  }

  if (o.canPrompt) return { mode: "prompt", title: env.mobile ? "Instalar no celular" : "Instalar no computador", steps: [] };

  if (env.os === "android") {
    if (env.browser === "firefox") return { mode: "manual", title: "Instalar no Android", steps: ["Toque nos três pontinhos (⋮)", "Toque em Instalar", "Confirme em Adicionar"] };
    return { mode: "manual", title: "Instalar no Android", steps: ["Toque nos três pontinhos (⋮), no canto da tela", "Toque em Instalar app (ou Adicionar à tela inicial)", "Confirme em Instalar", "Abra o app pelo ícone que apareceu na tela"], note: "Se a opção não aparecer, abra este endereço no Chrome." };
  }

  if (env.browser === "chrome" || env.browser === "edge") {
    return { mode: "manual", title: "Instalar no computador", steps: ["Clique no ícone de instalar, no fim da barra de endereço (um monitor com uma seta)", "Clique em Instalar", "O app abre numa janela própria e fica no menu Iniciar / Dock"], note: "Sem o ícone? Abra o menu (⋮) e escolha Transmitir, salvar e compartilhar › Instalar página como app." };
  }
  if (env.browser === "safari" && env.os === "mac") {
    return { mode: "manual", title: "Instalar no Mac", steps: ["No menu Arquivo, clique em Adicionar ao Dock", "Confirme o nome e clique em Adicionar"] };
  }
  return { mode: "unsupported", title: "Use o Chrome ou o Edge", steps: ["Abra este endereço no Chrome ou no Edge", "Clique em Instalar na barra de endereço"], note: "Este navegador não instala apps." };
}

// ---------------------------------------------------------------------------------------------------------------------

export type PushSupport = "ok" | "ios-instalar" | "ios-antigo" | "dentro-de-app" | "navegador";

/** Dá para receber alertas no popup neste aparelho? No iPhone só depois de instalar o app na tela de início. */
export function pushSupport(env: Env, o: { standalone: boolean; hasPush: boolean; hasNotification: boolean; hasServiceWorker: boolean }): PushSupport {
  if (env.os === "ios") {
    if (!iosHasWebApps(env)) return "ios-antigo";
    if (!o.standalone) return "ios-instalar";
  }
  if (env.inApp) return "dentro-de-app";
  return o.hasPush && o.hasNotification && o.hasServiceWorker ? "ok" : "navegador";
}

export const PUSH_SUPPORT_TEXT: Record<Exclude<PushSupport, "ok">, string> = {
  "ios-instalar": "No iPhone, os alertas no popup só funcionam com o app instalado na tela de início. Instale primeiro e abra por lá.",
  "ios-antigo": "Este iPhone precisa do iOS 16.4 ou mais novo para receber alertas no popup.",
  "dentro-de-app": "Abra no Chrome ou no Safari: dentro de outros aplicativos o navegador não deixa ligar os alertas.",
  navegador: "Este navegador não suporta alertas no popup. Use o Chrome, o Edge, o Firefox ou o Safari atualizados.",
};

export type PermissionView = "granted" | "denied" | "default" | "unsupported";

export const DENIED_HELP = "Os alertas estão bloqueados neste aparelho. Abra as configurações do navegador (ou do app), procure Notificações do site e escolha Permitir. Depois volte aqui.";

/** Texto do botão de compartilhar o endereço de instalação com a equipe pelo WhatsApp. */
export function whatsappShareUrl(appUrl: string): string {
  const text = `Instale o app do Candeeiro no seu celular e receba os alertas de reservas no popup:\n${appUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Endereço público da página de instalação a partir do endereço atual. */
export function installPageUrl(origin: string): string {
  try { return `${new URL(origin).origin}/app`; } catch { return "/app"; }
}

/** "há 3 min", "ontem": quando o aparelho foi visto pela última vez. */
export function seenAgo(iso: string | null | undefined, now: number = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "—";
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 2) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}
