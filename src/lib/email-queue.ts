import { panelUrl, renderAlertEmail, type Mail } from "@/lib/email";

/** Monta o e-mail de um item da fila (alerta ou teste) com o endereço do painel. */
export function mailForQueued(r: { subject: string; text: string; link_path: string | null }, panelBase: string): Mail {
  return renderAlertEmail({ subject: r.subject, body: r.text, url: panelUrl(panelBase, r.link_path) });
}
