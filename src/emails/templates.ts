// Modelos de e-mail da Rede Candeeiro (acesso à equipe, alertas do painel e confirmação ao cliente).
// HTML de e-mail: tabelas + estilos inline (Gmail, Outlook e Apple Mail ignoram CSS externo).
// Os trechos {{ ... }} são variáveis: nos e-mails de acesso seguem o padrão do Supabase Auth
// ({{ .ConfirmationURL }}, {{ .Token }}, {{ .Email }}, {{ .NewEmail }}); nos demais são preenchidos pelo painel.
// Gerar os arquivos: `bun scripts/build-emails.ts` → docs/emails/*.html

export const SITE = "https://candeeiro.tryade.com.br";
export const LOGO = `${SITE}/email-logo.png`;
const RED = "#d9201f";
const INK = "#1d1d1f";
const MUTED = "#6e6e73";
const LINE = "#ececf0";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type Row = [label: string, value: string];
export type Tpl = {
  id: string;
  group: "acesso" | "alerta" | "cliente";
  name: string;
  when: string;
  subject: string;
  preheader: string;
  title: string;
  /** frases do corpo (HTML simples permitido: <b>) */
  body: string[];
  rows?: Row[];
  /** destaque grande (código de 6 números) */
  code?: string;
  button?: { label: string; url: string };
  /** texto pequeno depois do botão */
  small?: string;
  /** faixa colorida de destaque no topo do cartão */
  tag?: { text: string; tone: "info" | "atencao" | "urgente" | "ok" };
  footer: "equipe" | "cliente";
};

const TONE = {
  info: { bg: "#eef2ff", fg: "#3730a3" },
  atencao: { bg: "#fff4e0", fg: "#8a4b00" },
  urgente: { bg: "#fde8e8", fg: "#a11a1a" },
  ok: { bg: "#e6f6ec", fg: "#17703a" },
} as const;

export function render(t: Tpl, logo = LOGO): string {
  const tag = t.tag ? `<p style="margin:0 0 14px"><span style="display:inline-block;background:${TONE[t.tag.tone].bg};color:${TONE[t.tag.tone].fg};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:6px 10px;border-radius:999px">${t.tag.text}</span></p>` : "";
  const body = t.body.map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.55;color:${INK}">${p}</p>`).join("");
  const rows = t.rows?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 4px;border:1px solid ${LINE};border-radius:14px;border-collapse:separate;overflow:hidden">${t.rows
        .map(([k, v], i) => `<tr><td style="padding:11px 14px;font-size:13px;color:${MUTED};width:38%;vertical-align:top;${i ? `border-top:1px solid ${LINE};` : ""}">${k}</td><td style="padding:11px 14px;font-size:15px;font-weight:600;color:${INK};vertical-align:top;${i ? `border-top:1px solid ${LINE};` : ""}">${v}</td></tr>`)
        .join("")}</table>`
    : "";
  const code = t.code
    ? `<p style="margin:18px 0 8px;text-align:center"><span style="display:inline-block;background:#f5f5f7;border-radius:14px;padding:16px 26px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:.35em;color:${INK}">${t.code}</span></p>`
    : "";
  const btn = t.button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 4px"><tr><td style="border-radius:14px;background:${RED}"><a href="${t.button.url}" style="display:inline-block;padding:16px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:14px">${t.button.label}</a></td></tr></table>`
    : "";
  const small = t.small ? `<p style="margin:18px 0 0;font-size:14px;line-height:1.55;color:${MUTED}">${t.small}</p>` : "";
  const foot =
    t.footer === "equipe"
      ? `Você recebe este e-mail por fazer parte da equipe da Rede Candeeiro.<br>Painel de gestão · <a href="${SITE}/admin" style="color:#86868b">${SITE.replace("https://", "")}/admin</a>`
      : `Rede Candeeiro · Goiânia e Anápolis<br>Dúvidas? Responda esta mensagem no WhatsApp da unidade.`;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${t.subject}</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:${FONT};color:${INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${t.preheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f7"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:24px;border-collapse:separate;overflow:hidden">
<tr><td style="height:6px;background:${RED};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td align="center" style="padding:26px 28px 6px"><img src="${logo}" width="200" alt="Rede Candeeiro" style="display:block;width:200px;max-width:70%;height:auto;border:0"></td></tr>
<tr><td style="padding:14px 32px 34px">
${tag}<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:700;color:${INK}">${t.title}</h1>
${body}${rows}${code}${btn}${small}
</td></tr></table>
<p style="max-width:560px;margin:18px auto 0;font-size:12px;line-height:1.6;color:#86868b;text-align:center">${foot}</p>
</td></tr></table></body></html>`;
}

const ENTRAR = `${SITE}/entrar`;
const PAINEL = (p: string) => `${SITE}/admin${p}`;

export const TEMPLATES: Tpl[] = [
  // ───────────── acesso (Supabase Auth) ─────────────
  { id: "convite", group: "acesso", name: "Convite para a equipe", when: "Quando um admin convida uma pessoa.", subject: "Seu acesso ao painel Rede Candeeiro", preheader: "Crie sua senha e comece a usar o painel.",
    title: "Você foi convidado(a) para o painel", body: ["Olá! Você agora faz parte da equipe da <b>Rede Candeeiro</b>. Crie sua senha para entrar no painel de reservas e atendimento."], button: { label: "Criar minha senha", url: "{{ .ConfirmationURL }}" }, small: "O link vale por tempo limitado e só funciona uma vez. Se você não esperava este convite, pode ignorar este e-mail.", footer: "equipe" },
  { id: "redefinir-senha", group: "acesso", name: "Redefinir senha", when: "Quando alguém toca em “Esqueci minha senha”.", subject: "Redefinir sua senha — Rede Candeeiro", preheader: "Crie uma senha nova para o painel.",
    title: "Redefinir sua senha", body: ["Recebemos um pedido para criar uma senha nova para <b>{{ .Email }}</b>."], button: { label: "Criar senha nova", url: "{{ .ConfirmationURL }}" }, small: "Não foi você? Ignore este e-mail: sua senha continua a mesma.", footer: "equipe" },
  { id: "link-de-acesso", group: "acesso", name: "Link de acesso", when: "Entrada por link, sem digitar a senha.", subject: "Seu link de acesso — Rede Candeeiro", preheader: "Toque para entrar no painel.",
    title: "Entrar no painel", body: ["Toque no botão para entrar. Você não precisa digitar a senha."], button: { label: "Entrar no painel", url: "{{ .ConfirmationURL }}" }, small: "O link vale por poucos minutos e só funciona uma vez. Se não foi você, ignore.", footer: "equipe" },
  { id: "confirmar-email", group: "acesso", name: "Confirmar e-mail", when: "Ao confirmar o endereço de e-mail de uma conta.", subject: "Confirme seu e-mail — Rede Candeeiro", preheader: "Falta só confirmar seu e-mail.",
    title: "Confirme seu e-mail", body: ["Falta pouco! Confirme que <b>{{ .Email }}</b> é seu para liberar o acesso."], button: { label: "Confirmar e-mail", url: "{{ .ConfirmationURL }}" }, small: "Se você não criou esta conta, ignore este e-mail.", footer: "equipe" },
  { id: "trocar-email", group: "acesso", name: "Trocar e-mail", when: "Quando a pessoa muda o e-mail do login.", subject: "Confirme o novo e-mail — Rede Candeeiro", preheader: "Confirme a troca do e-mail de acesso.",
    title: "Confirme a troca de e-mail", body: ["Você pediu para trocar o e-mail de acesso de <b>{{ .Email }}</b> para <b>{{ .NewEmail }}</b>."], button: { label: "Confirmar troca", url: "{{ .ConfirmationURL }}" }, small: "Não pediu essa troca? Ignore este e-mail e avise um admin.", footer: "equipe" },
  { id: "codigo", group: "acesso", name: "Código de confirmação", when: "Ao confirmar uma ação sensível (reautenticação).", subject: "Seu código de confirmação — Rede Candeeiro", preheader: "Use este código para continuar. Ele vale por poucos minutos.",
    title: "Seu código de confirmação", body: ["Digite este código no painel para continuar:"], code: "{{ .Token }}", small: "Nunca compartilhe este código. A equipe da Rede Candeeiro não pede esse número por telefone nem por mensagem.", footer: "equipe" },

  // ───────────── alertas do painel (equipe) ─────────────
  { id: "reserva-pendente", group: "alerta", name: "Reserva nova para aprovar", when: "Cliente reservou pelo site ou WhatsApp e precisa de aprovação.", subject: "Reserva nova para aprovar — {{unidade}}", preheader: "{{cliente}} · {{pessoas}} pessoas · {{data}} às {{hora}}",
    tag: { text: "Atenção", tone: "atencao" }, title: "Reserva nova para aprovar", body: ["Chegou uma reserva aguardando a sua decisão."],
    rows: [["Cliente", "{{cliente}}"], ["Unidade", "{{unidade}}"], ["Data e hora", "{{data}} às {{hora}}"], ["Pessoas", "{{pessoas}}"], ["Como chegou", "{{origem}}"]], button: { label: "Aprovar ou recusar", url: PAINEL("/aprovacoes") }, footer: "equipe" },
  { id: "grupo-grande", group: "alerta", name: "Grupo grande", when: "Reserva de grupo grande — só admins recebem.", subject: "Grupo grande aguardando você — {{unidade}}", preheader: "{{pessoas}} pessoas em {{data}} às {{hora}}",
    tag: { text: "Urgente", tone: "urgente" }, title: "Grupo grande aguardando um admin", body: ["Uma reserva de grupo grande precisa da aprovação de um admin."],
    rows: [["Cliente", "{{cliente}}"], ["Unidade", "{{unidade}}"], ["Data e hora", "{{data}} às {{hora}}"], ["Pessoas", "{{pessoas}}"]], button: { label: "Abrir aprovações", url: PAINEL("/aprovacoes") }, footer: "equipe" },
  { id: "reserva-cancelada", group: "alerta", name: "Cancelamento do cliente", when: "O cliente cancelou e informou o motivo.", subject: "Reserva cancelada — {{cliente}}", preheader: "{{unidade}} · {{data}} às {{hora}}",
    tag: { text: "Aviso", tone: "info" }, title: "Uma reserva foi cancelada", body: ["O cliente cancelou a reserva abaixo."],
    rows: [["Cliente", "{{cliente}}"], ["Unidade", "{{unidade}}"], ["Data e hora", "{{data}} às {{hora}}"], ["Pessoas", "{{pessoas}}"], ["Motivo", "{{motivo}}"]], button: { label: "Ver reserva", url: PAINEL("/reservas") }, footer: "equipe" },
  { id: "sac-novo", group: "alerta", name: "Novo atendimento no SAC", when: "Reclamação, dúvida ou pedido de atendente.", subject: "Novo atendimento no SAC — {{assunto}}", preheader: "{{cliente}} · {{unidade}}",
    tag: { text: "Atenção", tone: "atencao" }, title: "Novo atendimento no SAC", body: ["Um cliente precisa de atenção da equipe."],
    rows: [["Cliente", "{{cliente}}"], ["Unidade", "{{unidade}}"], ["Assunto", "{{assunto}}"]], button: { label: "Abrir atendimento", url: PAINEL("/sac") }, footer: "equipe" },
  { id: "lead-whatsapp", group: "alerta", name: "Lead no WhatsApp", when: "Alguém chamou pelo botão do site.", subject: "Novo contato pelo WhatsApp — {{cidade}}", preheader: "{{nome}} · {{telefone}}",
    tag: { text: "Aviso", tone: "info" }, title: "Novo contato pelo WhatsApp", body: ["Alguém acabou de chamar pelo botão do site."],
    rows: [["Nome", "{{nome}}"], ["Telefone", "{{telefone}}"], ["Cidade", "{{cidade}}"]], button: { label: "Ver contato", url: PAINEL("/contatos") }, footer: "equipe" },
  { id: "falha-envio", group: "alerta", name: "Mensagem que não saiu", when: "Confirmação ou CRM que falhou — só admins.", subject: "Mensagem não enviada — {{cliente}}", preheader: "{{motivo}}",
    tag: { text: "Urgente", tone: "urgente" }, title: "Uma mensagem não foi enviada", body: ["A mensagem abaixo não chegou ao cliente. Vale conferir e, se precisar, falar com ele direto."],
    rows: [["Cliente", "{{cliente}}"], ["Unidade", "{{unidade}}"], ["Tipo", "{{tipo}}"], ["Motivo", "{{motivo}}"]], button: { label: "Ver no painel", url: PAINEL("/alertas") }, footer: "equipe" },

  // ───────────── para o cliente ─────────────
  { id: "reserva-confirmada", group: "cliente", name: "Reserva confirmada", when: "Quando a reserva é confirmada (e o cliente tem e-mail).", subject: "Reserva confirmada — Candeeiro {{unidade}}", preheader: "Te esperamos em {{data}} às {{hora}}.",
    tag: { text: "Confirmada", tone: "ok" }, title: "Sua reserva está confirmada", body: ["Olá, {{cliente}}! Reservamos sua mesa. Te esperamos!"],
    rows: [["Unidade", "{{unidade}}"], ["Endereço", "{{endereco}}"], ["Data e hora", "{{data}} às {{hora}}"], ["Pessoas", "{{pessoas}}"]],
    small: "Precisa mudar ou cancelar? Responda pelo WhatsApp da unidade e avise com antecedência.", footer: "cliente" },
];

export const SAMPLE: Record<string, string> = {
  cliente: "Mariana Souza", unidade: "Goiânia", cidade: "Goiânia", data: "sáb., 21 nov.", hora: "20:00", pessoas: "6", origem: "Site",
  motivo: "Mudança de planos da família", assunto: "Demora no atendimento", nome: "Rafael Lima", telefone: "(62) 99999-0000", tipo: "Cancelamento",
  endereco: "Setor Marista, Goiânia", "Email": "ana@candeeiro.com.br", "NewEmail": "ana.silva@candeeiro.com.br", "Token": "482913",
  "ConfirmationURL": "https://candeeiro.tryade.com.br/entrar?token=exemplo",
};

/** Troca {{variavel}} e {{ .Variavel }} pelos valores de exemplo (só para pré-visualizar). */
export function fill(html: string): string {
  return html.replace(/\{\{\s*\.?(\w+)\s*\}\}/g, (m, k: string) => SAMPLE[k] ?? m);
}
