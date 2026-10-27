# Rede Candeeiro Reservas

Sistema de reservas, SAC e integração com o Tryade CRM (Chatwoot) e com o SDR (n8n) da Rede Candeeiro.
Desenvolvido pela Tryade. Idioma: pt-BR. Fuso: `America/Sao_Paulo`.

- Landing pública de reservas: `/reservar`
- Painel interno: `/admin` (login em `/entrar`)
- API do SDR: `/api/public/sdr/*` (contrato em `/api/public/sdr/openapi.json`)
- Webhook e worker do CRM: `/api/public/crm/*`

## Fluxo de reserva (`/reservar`)

Capa (escolha do rodízio) → contatos (nome, WhatsApp, aceite LGPD) → unidade (só se houver mais de uma) → pessoas
→ quando (hoje e próximos dias + calendário) → ocasião e pedido → "Solicitar reserva".

- O contato é gravado já no passo 2 (`capture_reservation_lead`), mesmo que a pessoa desista; vira `convertida` ao reservar.
- Rodízio, ocasião, aniversariante e campanha ficam em `reservations` (`service`, `occasion`, `celebrant_name`, `campaign`)
  e aparecem na lista e na gaveta do painel.
- **Links de campanha:** cada campanha tem seu link. O link geral `/reservar` mostra a escolha do rodízio; links como
  `/reservar?rodizio=carnes&campanha=black-friday` já entram com o rodízio definido e gravam a campanha
  (`rodizio` = `carnes` | `pizza`; `campanha` = texto livre, normalizado para `a-z 0-9 _ -`).

## Estado por fase

| Fase | Conteúdo | Status |
| --- | --- | --- |
| 1–3 | Banco, RLS, auth, unidades, capacidade, reserva pública com trava transacional | Pronta |
| 4 | Painel `/admin` (lista, calendário, filtros, gaveta, reserva manual, equipe, unidades, realtime) | Pronta |
| 5 | SAC (tabelas existem; tela e fluxo pendentes) | Pendente |
| 6 | API do SDR, webhook/fila do CRM, aba de integrações | Pronta, sem teste ponta a ponta com Chatwoot real |
| 7–9 | Mensagens WhatsApp, dashboard/relatórios/CSV, testes finais e publicação | Pendentes |

## Stack

TanStack Start (React 19, TypeScript) + Tailwind 4 + shadcn/ui, publicado em Cloudflare (workerd).
Backend: Lovable Cloud (PostgreSQL/Supabase: Auth, RLS, RPCs, Realtime). Testes: Vitest.

## Estrutura

```text
src/routes/            rotas (páginas e endpoints /api/public/*)
src/server/*.server.ts lógica de servidor (usa service role; só é importada dinamicamente pelas rotas)
src/lib/integration/   lógica pura e testada (telefone, event_id, HMAC, idempotência, mensagens, mapa de labels)
src/integrations/      clientes Supabase e autenticação
db/migrations/         SQL canônico, numerado (fonte da verdade do schema)
db/maintenance/        scripts pontuais, NÃO são migrations (rodar à mão, uma vez)
drizzle/               gerado pelo Lovable ao aplicar migrations; não editar
docs/                  INTEGRACAO.md (CRM + SDR), ATENDENTE_WHATSAPP.md (atendente n8n: config, testes, replicar) e PROMPT_MASTER.md (prompt original, referência histórica)
n8n/                   código-fonte (SDK do n8n) dos workflows do atendente de WhatsApp e do follow-up
```

## Rodando localmente

```sh
bun install
bun run dev        # servidor de desenvolvimento
bun run test       # testes (Vitest)
bun run build
```

Variáveis do cliente (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) vêm do Lovable Cloud. A chave publicável é
pública por desenho; **chaves de serviço e tokens do CRM nunca entram no repositório**
(`TRYADE_CRM_API_TOKEN` e `TRYADE_CRM_WEBHOOK_HMAC_SECRET` ficam só nos secrets do servidor).
Sem variáveis, `src/lib/supabase.ts` devolve `null` e as telas mostram "não conectado".

## Migrations

1. Escreva o SQL em `db/migrations/NNN_descricao.sql`. Nunca edite uma migration já aplicada: crie a próxima.
2. Aplique pela ferramenta de migração do Lovable. O Lovable grava o espelho em `drizzle/migrations/`.
3. Arquivo em `db/` e schema no banco devem sempre coincidir.

Última: `005_rodizio_ocasiao_campanha_leads.sql`. A `004_hardening.sql` é da auditoria de segurança de 26/10/2026; o que a ferramenta de migração não aceita (UPDATE de dados, pg_cron) está em `db/maintenance/`.

## Regras de segurança (resumo; detalhes em `AGENTS.md`)

- Visitantes só chamam RPCs `SECURITY DEFINER` (`public_list_units`, `get_unit_slots`, `get_unit_available_dates`,
  `create_public_reservation`). `anon` não tem acesso direto a nenhuma tabela.
- Permissões vivem no banco: `user_roles` + `can_access_unit` / `can_manage_unit` em toda policy de RLS.
- Funcionário não escreve em `reservations` nem em `reservation_status_history` diretamente: só por RPC.
- Usuário não altera `is_active` nem `organization_id` do próprio perfil (trigger `user_profiles_guard`).
- Credenciais nunca vão para tabelas: o banco guarda só o nome do secret e hashes (chaves de API, token do webhook).

## LGPD / retenção

`run_data_retention()` (agendada às 00:30 de São Paulo via pg_cron) apaga logs de integração e eventos já processados
(90 dias), outbox finalizado (180 dias), auditoria (365 dias), idempotência expirada e contatos capturados
(`reservation_leads`: 90 dias se não viraram reserva, 180 dias os demais). Nada pendente é apagado.
`anonymize_inactive_customers(meses)` existe mas **não é agendada**; rode manualmente após definir o prazo.

## Pendências conhecidas

- Cadastro aberto em `/entrar` (sem papel a conta não acessa nada, mas gera lixo): decidir entre convite ou desligar
  o auto-cadastro nas configurações de autenticação.
- Instância do Tryade CRM ainda não criada; sem credenciais o worker responde "CRM não configurado" e não simula envio.
- Dados reais das unidades (horários, capacidade, endereço, foto) e a logo (hero da landing é placeholder).
- Limpeza dos dados de teste: `db/maintenance/2026-10-26_limpar_dados_teste.sql` (aguarda aprovação).
