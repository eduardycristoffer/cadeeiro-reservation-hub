import { describe, expect, it } from "vitest";
import { extractChatwootPhone, maskPhone, normalizeBrPhone } from "@/lib/integration/phone";
import { buildInboundEventId, isOptOutText, normalizeChatwootPayload } from "@/lib/integration/chatwoot-events";
import { hmacSha256Hex, sha256Hex, verifyChatwootSignature } from "@/lib/integration/crypto";
import { decideIdempotency } from "@/lib/integration/idempotency";
import {
  claimsConfirmed, handoffMessage, promisesDeadlineOrSolution, reservationMessage, reservationUpdateMessage, sacMessage,
} from "@/lib/integration/messages";
import { nextLabels } from "@/lib/integration/crm-mapping";
import { codeFromDbError } from "@/lib/integration/errors";

describe("telefone", () => {
  it("normaliza igual ao banco", () => {
    expect(normalizeBrPhone("(11) 98765-4321")).toBe("5511987654321");
    expect(normalizeBrPhone("+55 11 3456-7890")).toBe("551134567890");
    expect(normalizeBrPhone("12345")).toBeNull();
  });
  it("extrai do identifier do WhatsApp quando não há phone_number", () => {
    expect(extractChatwootPhone({ identifier: "5511987654321@s.whatsapp.net" })).toBe("5511987654321");
  });
  it("prefere phone_number e cai para source_id", () => {
    expect(extractChatwootPhone({ phone_number: "+5521998887777", identifier: "5511987654321@s.whatsapp.net" })).toBe("5521998887777");
    expect(extractChatwootPhone({ source_id: "5531988776655" })).toBe("5531988776655");
    expect(extractChatwootPhone({ identifier: "abc@lid" })).toBeNull();
  });
  it("mascara para log", () => {
    expect(maskPhone("5511987654321")).toBe("*********4321");
  });
});

describe("event_id do webhook", () => {
  it("é determinístico para o mesmo evento", () => {
    const p = { id: 42, created_at: 1761490000 };
    expect(buildInboundEventId("message_created", p)).toBe(buildInboundEventId("message_created", { ...p }));
    expect(buildInboundEventId("message_created", p)).toBe("message_created:msg:42:2025-10-26T14:46:40.000Z");
  });
  it("muda quando muda o carimbo de tempo da conversa", () => {
    const a = buildInboundEventId("conversation_updated", { id: 7, updated_at: 1761490000 });
    const b = buildInboundEventId("conversation_updated", { id: 7, updated_at: 1761490060 });
    expect(a).not.toBe(b);
  });
});

describe("assinatura HMAC do Chatwoot", () => {
  const secret = "s3cr3t";
  const body = '{"event":"message_created"}';
  it("aceita assinatura correta", async () => {
    const sig = `sha256=${await hmacSha256Hex(secret, `1761490000.${body}`)}`;
    expect(await verifyChatwootSignature({ secret, rawBody: body, signature: sig, timestamp: "1761490000", nowSeconds: 1761490010 })).toBe(true);
  });
  it("rejeita corpo alterado, assinatura ausente e timestamp antigo", async () => {
    const sig = `sha256=${await hmacSha256Hex(secret, `1761490000.${body}`)}`;
    expect(await verifyChatwootSignature({ secret, rawBody: body + " ", signature: sig, timestamp: "1761490000", nowSeconds: 1761490010 })).toBe(false);
    expect(await verifyChatwootSignature({ secret, rawBody: body, signature: null, timestamp: "1761490000", nowSeconds: 1761490010 })).toBe(false);
    expect(await verifyChatwootSignature({ secret, rawBody: body, signature: sig, timestamp: "1761490000", nowSeconds: 1761490000 + 3600 })).toBe(false);
  });
  it("sha256 bate com o hash usado no banco", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("idempotência", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  it("primeira vez prossegue", () => expect(decideIdempotency(null, "h1").action).toBe("proceed"));
  it("mesma chave e mesmo corpo devolve a resposta original", () => {
    expect(decideIdempotency({ request_hash: "h1", status_code: 201, response: { ok: true }, expires_at: future }, "h1"))
      .toEqual({ action: "replay", status: 201, body: { ok: true } });
  });
  it("mesma chave com corpo diferente é conflito", () => {
    expect(decideIdempotency({ request_hash: "h1", status_code: 201, response: {}, expires_at: future }, "h2").action).toBe("conflict");
  });
  it("ainda processando", () => {
    expect(decideIdempotency({ request_hash: "h1", status_code: null, response: null, expires_at: future }, "h1").action).toBe("in_progress");
  });
  it("expirada (24h) prossegue de novo", () => {
    expect(decideIdempotency({ request_hash: "h1", status_code: 201, response: {}, expires_at: new Date(Date.now() - 1).toISOString() }, "h2").action).toBe("proceed");
  });
});

describe("opt-out", () => {
  it("aceita PARAR, SAIR e STOP ignorando maiúsculas e espaços", () => {
    for (const t of ["PARAR", "parar", " Sair ", "s t o p", "\nStop\n"]) expect(isOptOutText(t)).toBe(true);
  });
  it("não aceita frases que só contêm a palavra", () => {
    for (const t of ["quero parar de receber", "STOP!", "sair amanhã", "", null]) expect(isOptOutText(t)).toBe(false);
  });
  it("só mensagens recebidas do cliente viram opt-out e o texto não é guardado", () => {
    const base = { id: 9, created_at: 1761490000, content: "PARAR", conversation: { id: 5, inbox_id: 2 },
      sender: { id: 3, type: "contact", identifier: "5511987654321@s.whatsapp.net" } };
    const inc = normalizeChatwootPayload("message_created", { ...base, message_type: "incoming" });
    expect(inc.message?.opt_out).toBe(true);
    expect(inc.contact?.phone).toBe("5511987654321");
    expect(JSON.stringify(inc)).not.toContain("PARAR");
    const out = normalizeChatwootPayload("message_created", { ...base, message_type: "outgoing", sender: { id: 1, type: "user" } });
    expect(out.message?.opt_out).toBe(false);
  });
});

describe("mensagem_sugerida", () => {
  const r = { protocol: "CAD-261120-ABCDE", unit_name: "Centro", date: "2026-11-20", time: "20:00", party_size: 4 };
  it("pendente nunca promete confirmação", () => {
    const m = reservationMessage({ ...r, status: "pendente" });
    expect(claimsConfirmed(m)).toBe(false);
    expect(m).toContain("não está confirmada");
  });
  it("confirmada diz que está confirmada", () => {
    expect(claimsConfirmed(reservationMessage({ ...r, status: "confirmada" }))).toBe(true);
  });
  it("alteração de grupo grande que voltou a pendente não promete confirmação", () => {
    expect(claimsConfirmed(reservationUpdateMessage({ ...r, status: "pendente", previous_status: "confirmada" }))).toBe(false);
  });
  it("SAC e atendimento humano não prometem prazo nem solução", () => {
    expect(promisesDeadlineOrSolution(sacMessage("SAC-261026-ABCDE"))).toBe(false);
    expect(promisesDeadlineOrSolution(handoffMessage())).toBe(false);
  });
  it("o detector pega promessas de prazo", () => {
    expect(promisesDeadlineOrSolution("Resolveremos em até 48 horas")).toBe(true);
    expect(promisesDeadlineOrSolution("Retornamos em 2 dias")).toBe(true);
  });
});

describe("etiquetas do CRM", () => {
  it("troca a etiqueta de reserva e preserva as demais", () => {
    expect(nextLabels("reservation.status_changed", { status: "confirmada" }, ["vip", "reserva-pendente"])).toEqual(["reserva-confirmada", "vip"]);
  });
  it("handoff adiciona atendimento-humano", () => {
    expect(nextLabels("handoff.requested", {}, [])).toContain("atendimento-humano");
  });
});

it("erro do banco vira código da API", () => {
  expect(codeFromDbError({ message: "SLOT_UNAVAILABLE" })).toBe("SLOT_UNAVAILABLE");
  expect(codeFromDbError(new Error("boom"))).toBe("INTERNAL_ERROR");
});
