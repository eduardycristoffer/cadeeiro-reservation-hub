// Mensagens sugeridas ao SDR. Regras:
// - nunca dizer que está confirmada quando o status é pendente;
// - nunca prometer prazo, horário de retorno ou solução no SAC/atendimento humano.

const dateBr = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export function reservationMessage(r: {
  status: string; protocol: string; unit_name: string; date: string; time: string; party_size: number; is_large_group?: boolean;
}): string {
  const base = `${r.unit_name}, ${dateBr(r.date)} às ${r.time.slice(0, 5)}, ${r.party_size} ${r.party_size === 1 ? "pessoa" : "pessoas"}. Protocolo ${r.protocol}.`;
  if (r.status === "confirmada") return `Sua reserva está confirmada: ${base}`;
  return `Recebemos sua solicitação de reserva: ${base} Ela ainda não está confirmada: a unidade vai analisar o pedido e o retorno virá por aqui.`;
}

export function reservationUpdateMessage(r: { status: string; previous_status: string; protocol: string; unit_name: string; date: string; time: string; party_size: number }): string {
  if (r.status === "pendente" && r.previous_status === "confirmada") {
    return `Recebemos a alteração da reserva ${r.protocol}. Com a nova quantidade de pessoas ela voltou para análise da unidade e ainda não está confirmada.`;
  }
  if (r.status === "confirmada") return `Reserva ${r.protocol} alterada e confirmada: ${dateBr(r.date)} às ${r.time}, ${r.party_size} pessoas.`;
  return `Recebemos a alteração da reserva ${r.protocol}: ${dateBr(r.date)} às ${r.time}, ${r.party_size} pessoas. Ela ainda não está confirmada: a unidade vai analisar o pedido.`;
}

export function cancelMessage(protocol: string): string {
  return `A reserva ${protocol} foi cancelada.`;
}

export function sacMessage(protocol: string): string {
  return `Registramos sua solicitação com o protocolo ${protocol}. A equipe responsável vai analisar o caso e dará retorno por este canal.`;
}

export function handoffMessage(): string {
  return "Certo, vou encaminhar sua conversa para uma pessoa da nossa equipe, que vai continuar o atendimento por aqui.";
}

/** Detecta frases proibidas: promessa de prazo ou de solução. */
export function promisesDeadlineOrSolution(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b\d+\s*(h|hs|hora|horas|min|minutos|dia|dias|dias úteis)\b/.test(t) ||
    /\b(em até|até amanhã|hoje mesmo|prazo|garant|resolver(emos)?|será resolvid|solução|reembols|compensa)/.test(t)
  );
}

/** Detecta afirmação de confirmação (sem negação). */
export function claimsConfirmed(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(está|esta|foi|ficou)\s+confirmad[ao]\b/.test(t.replace(/não\s+(está|esta|foi|ficou)\s+confirmad[ao]/g, ""));
}
