# Rede Candeeiro Reservas

Sistema de reservas, SAC e integração com o Tryade CRM (Chatwoot) e com o SDR (n8n) da Rede Candeeiro.
Desenvolvido pela Tryade. Idioma: pt-BR. Fuso: `America/Sao_Paulo`.

- Home por cidade: `/` (Goiânia / Anápolis)
- Reserva pública: `/reservar?cidade=goiania&servico=almoco_quilo`
- Contatos WhatsApp: `/admin/leads`; números em Integrações → WhatsApp por cidade
- Painel interno: `/admin` (login em `/entrar`)
- API do SDR: `/api/public/sdr/*` (contrato em `/api/public/sdr/openapi.json`)
- Webhook e worker do CRM: `/api/public/crm/*`

## Fluxo de reserva (`/reservar`)

Home (cidade → serviço) → contatos (nome, WhatsApp, aceite LGPD) → pessoas
→ quando (hoje e próximos dias + calendário) → ocasião e pedido → "Solicitar reserva".

- `src/lib/oferta.ts` centraliza a oferta pública: Goiânia (quilo/pizza), Anápolis (carnes/pizza). O cadastro operacional `units.services` não foi alterado.
- A unidade é selecionada por slug exato. Cidade e serviço escolhidos na home não são perguntados novamente.
- O contato é gravado no início (`capture_reservation_lead`), mesmo que a pessoa desista; vira `convertida` ao reservar.
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
| 5 | SAC mobile/kanban, histórico, responsáveis, SLA e resolução | Pronta |
| 6 | API do SDR, webhook/fila do CRM, aba de integrações | Pronta, sem teste ponta a ponta com Chatwoot real |
| 7–9 | Mensagens, histórico, equipe por convite, relatórios/CSV e painel mobile | Implementados; integração real e publicação pendentes |
| 4A | Home por cidade, WhatsApp com captura, motivos de cancelamento, refinamento Apple | Implementada; números de WhatsApp vazios |

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

Última: `012_cidades_whatsapp.sql`, aplicada com espelho byte-idêntico em `drizzle/migrations/0012_cidades_whatsapp.sql`.
As migrations 010 e 011 entregam equipe/histórico e SAC/relatórios. A 012 acrescenta `whatsapp_leads`, `city_whatsapp_settings` e RPCs de captura, configuração e status auditados, além dos números do botão no funil. O serviço `almoco_quilo` já era aceito pelos CHECKs; a 012 amplia a validação dos dois RPCs públicos de reserva, sem alterar gatilhos ou unidades.

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

- Acesso à equipe já é por convite, sem cadastro aberto.
- Números de WhatsApp das duas cidades começam vazios. O super admin deve configurar os números reais em Integrações → WhatsApp por cidade. Sem número, o contato é capturado e a página informa recebimento, sem redirecionar nem simular mensagem.
- Não existe sistema de notifications neste repositório; avisos de novos leads, Pixel e e-mail ficam para a 4B.
- Captura → redirecionamento real, alteração de status do lead e cancelamento de reserva real não foram executados com dados reais nesta revisão; nenhum contato fictício foi criado.
- Lint global aponta formatação preexistente; testes e compilação automáticos são registrados no roadmap.
- Instância do Tryade CRM ainda não criada; sem credenciais o worker responde "CRM não configurado" e não simula envio.
- Dados reais das unidades (horários, capacidade, endereço, foto) e a logo (hero da landing é placeholder).
- Limpeza dos dados de teste: `db/maintenance/2026-10-26_limpar_dados_teste.sql` (aguarda aprovação).

## WhatsApp e cancelamentos (4A)

O botão aparece nas páginas públicas, nunca no painel. `capture_whatsapp_lead` valida consentimento, nome/telefone, honeypot e limites por IP/telefone; guarda cidade, página e UTM/fbclid. Números públicos são lidos por `public_city_whatsapp`, sem acesso anônimo a tabelas. Edição dos números é exclusiva de super admin. Leads têm RLS por unidade, paginação, CSV e status novo/chamado/convertido/perdido. Conversão é marcada pela equipe; não é inferida de um clique no WhatsApp.

Recusa/cancelamento usam o mesmo seletor de motivo; Outro exige detalhe. O RPC existente recebe exatamente `Recusada: <motivo>` ou `Cancelada: <motivo>`, com ` — <detalhe>` quando preenchido. Nenhum RPC SDR, gatilho de reserva ou agendamento foi alterado. O envio do motivo ao cliente continua responsabilidade das automações externas.

Visual: fonte de sistema, neutros, vermelho discreto, áreas de toque amplas, barras de vidro, seleção por períodos e ações do dia. Busca do menu leva a reservas por nome/telefone/protocolo, com atalhos para SAC e contatos. Fotos reais das unidades não foram fornecidas; a home usa ícones e a reserva mantém a imagem ilustrativa anterior.
