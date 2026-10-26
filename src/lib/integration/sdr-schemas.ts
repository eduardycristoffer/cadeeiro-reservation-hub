import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const phone = z.string().min(8).max(30);
const ext = z.string().trim().min(1).max(100);

export const CLASSIFICATIONS = [
  "interesse_reserva", "reserva_realizada", "consulta_reserva", "alteracao_reserva", "cancelamento",
  "sac_reclamacao", "elogio", "sugestao", "duvida_geral", "outros", "atendimento_humano",
] as const;
export const SAC_CATEGORIES = ["reclamacao", "elogio", "sugestao", "duvida", "problema_reserva", "atendimento", "outros"] as const;
export const SAC_PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;

export const availabilityQuery = z.object({
  unit_id: z.string().uuid().optional(),
  unit_slug: z.string().min(1).max(120).optional(),
  date: date.optional(),
  from: date.optional(),
  to: date.optional(),
  party_size: z.coerce.number().int().min(1).max(200).default(1),
}).refine((q) => q.unit_id || q.unit_slug, { message: "informe unit_id ou unit_slug", path: ["unit_id"] })
  .refine((q) => q.date || (q.from && q.to), { message: "informe date ou from+to", path: ["date"] });

export const createReservationBody = z.object({
  unit_id: z.string().uuid(),
  date, time,
  party_size: z.number().int().min(1).max(200),
  full_name: z.string().trim().min(2).max(120),
  phone,
  notes: z.string().max(500).optional().nullable(),
  whatsapp_opt_in: z.boolean().optional().default(true),
  conversation_external_id: ext.optional().nullable(),
  contact_external_id: ext.optional().nullable(),
});

export const findReservationsQuery = z.object({ phone, protocol: z.string().max(40).optional() });

export const patchReservationBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("alterar"), phone,
    date: date.optional(), time: time.optional(), party_size: z.number().int().min(1).max(200).optional(),
  }),
  z.object({ action: z.literal("cancelar"), phone, reason: z.string().trim().min(2).max(500) }),
]).superRefine((b, ctx) => {
  if (b.action === "alterar" && !b.date && !b.time && !b.party_size) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "informe date, time ou party_size", path: ["date"] });
  }
});

export const sacBody = z.object({
  category: z.enum(SAC_CATEGORIES),
  subject: z.string().trim().min(3).max(160),
  description: z.string().max(2000).optional().nullable(),
  unit_id: z.string().uuid().optional().nullable(),
  phone,
  full_name: z.string().max(120).optional().nullable(),
  priority: z.enum(SAC_PRIORITIES).optional().default("media"),
  human_requested: z.boolean().optional().default(false),
  conversation_external_id: ext.optional().nullable(),
});

export const classifyBody = z.object({
  external_id: ext,
  classification: z.enum(CLASSIFICATIONS),
  intent: z.string().max(120).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  unit_id: z.string().uuid().optional().nullable(),
  result: z.string().max(120).optional().nullable(),
  summary: z.string().max(500).optional().nullable(),
  started_at: z.string().datetime({ offset: true }).optional().nullable(),
  completed_at: z.string().datetime({ offset: true }).optional().nullable(),
  reservation_protocol: z.string().max(40).optional().nullable(),
  sac_protocol: z.string().max(40).optional().nullable(),
  contact_external_id: ext.optional().nullable(),
  phone: phone.optional().nullable(),
  contact_name: z.string().max(120).optional().nullable(),
  channel: z.string().max(30).optional().default("whatsapp"),
});

export const handoffBody = z.object({
  conversation_external_id: ext,
  phone,
  full_name: z.string().max(120).optional().nullable(),
  unit_id: z.string().uuid().optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
});
