# Rede Candeeiro Reservas

DIRETRIZ DE DESIGN (vale para TODO o sistema, painel e landing):
Estilo Apple: minimalista, limpo, preto e branco. Fundo branco (#FFFFFF) e off-white (#F5F5F7), texto preto (#1D1D1F), cinzas neutros para apoio, sem cores vibrantes (no máximo um acento discreto para status). Tipografia grande e arejada (Inter ou SF-like), muito espaço em branco, cantos arredondados generosos (16 a 24px), sombras suaves, transições e microanimações sutis. Botões primários pretos com texto branco, secundários com borda fina. Suporte a modo escuro preto puro. Landing page /reservar mobile-first, focada em CONVERSÃO: título forte, um único CTA claro "Reservar agora", formulário em etapas sem fricção, prova de confiança, carregamento rápido. Painel administrativo com navegação lateral limpa, tabelas com filtros e calendário visual.

ESCOPO DESTA PRIMEIRA ENTREGA: executar as FASES 1, 2 e 3 do prompt abaixo (banco de dados + segurança + autenticação, unidades + regras de capacidade, landing page com criação real de reservas). Gere as migrations SQL completas com RLS. Se o Supabase ainda não estiver conectado ao projeto, deixe tudo pronto (frontend + migrations) e me avise para conectar o Supabase próprio. As demais fases serão pedidas em seguida.

PROMPT MASTER | REDE CADEEIRO

Sistema de Gestão de Reservas, SAC e Integração Tryade CRM

Atue como arquiteto de software sênior, especialista em SaaS, React, TypeScript, Supabase, automações, integração de CRMs e sistemas de reservas para estabelecimentos.

Sua missão é CONSTRUIR um sistema funcional e pronto para operação para a Rede Cadeeiro, utilizando Lovable como ambiente de desenvolvimento e Supabase como backend.

Não quero somente uma interface ilustrativa. Quero um MVP real, persistente, seguro e testável, com prioridade de entrega no dia de hoje.

Nome do projeto: Cadeeiro Gestão
Desenvolvido por: Tryade
Idioma: português brasileiro
Moeda: BRL
Fuso horário: America/Sao_Paulo

1. STACK TECNOLÓGICA

Frontend: React + TypeScript, Tailwind CSS, shadcn/ui, aplicação responsiva, componentes reutilizáveis.

Backend: Supabase próprio, conectado ao Lovable; PostgreSQL; Supabase Auth; Row Level Security; Supabase Edge Functions; Supabase Realtime quando necessário; Webhooks para integração.

Não criar backend alternativo desnecessariamente. Não ativar Lovable Cloud como proprietário do banco de dados se o Supabase externo já estiver conectado.

2. ESTRUTURA DE ACESSO

SUPER ADMIN: acesso a todas as unidades; criação de usuários; controle de configurações; visualização de todas as reservas e atendimentos; relatórios consolidados; gerenciamento de integrações.

GESTOR: visualizar e gerenciar unidades autorizadas; acessar reservas e calendário; gerenciar funcionários; acompanhar SAC; consultar relatórios.

FUNCIONÁRIO: visualizar reservas de sua unidade; confirmar chegada de clientes; atualizar status das reservas; atender solicitações atribuídas; registrar observações operacionais.

Implementar controle de acesso no banco de dados por RLS, sem depender somente de validação visual no frontend.

3. DASHBOARD

Indicadores: reservas de hoje, amanhã, semana, mês; pendentes; confirmadas; canceladas; clientes que compareceram; que não compareceram; quantidade total de pessoas previstas; atendimentos de SAC abertos; atendimentos resolvidos.
Filtros: unidade, período, status, origem da reserva.
Gráficos simples, calendário e atualizações em tempo real quando viável.

4. GERENCIAMENTO DE RESERVAS

Campos: ID único, protocolo amigável, nome do cliente, WhatsApp, unidade, data, horário, quantidade de pessoas, observações, origem, status, responsável, data de criação, histórico de alterações.
Status: Pendente, Confirmada, Cancelada, Concluída, Não compareceu.
Busca, filtros, edição autorizada e visualização em calendário.

Disponibilidade: capacidade configurável por unidade, dia e faixa horária; horários de funcionamento configuráveis; bloqueio de datas especiais; exceções para feriados; impedir reservas acima da capacidade; validar disponibilidade novamente no backend na confirmação; controle transacional para evitar reservas simultâneas que ultrapassem a capacidade; bloqueios manuais pelo gestor; considerar a quantidade de pessoas por reserva; diferenciar solicitação de reserva de reserva efetivamente confirmada.
Estruturar o banco para permitir evolução futura para mesas específicas ou turnos de ocupação.

5. LANDING PAGE PÚBLICA

Rota pública /reservar. Moderna, rápida e extremamente intuitiva no celular. Identidade visual configurável, logo e fotos reais adicionáveis, título claro, botão "Reservar agora", formulário multietapas com indicador de progresso e mensagens de validação amigáveis.

ETAPA 1: Em qual unidade deseja reservar? Cards com unidades cadastradas.
ETAPA 2: Para qual dia deseja sua reserva? Calendário bloqueando datas indisponíveis.
ETAPA 3: Qual horário deseja? Somente horários elegíveis.
ETAPA 4: Para quantas pessoas? Seleção rápida de 1 a 10 e opção para grupo maior.
ETAPA 5: Como podemos identificar sua reserva? Nome completo, WhatsApp brasileiro com máscara, observação opcional.
ETAPA 6: Revisar e confirmar solicitação, com resumo antes de enviar.

Ao finalizar: validar disponibilidade; salvar cliente e reserva no Supabase; associar reserva ao cliente; gerar protocolo; registrar origem "landing_page"; acionar integração com Tryade CRM (estrutura preparada); enfileirar mensagem WhatsApp conforme elegibilidade; exibir confirmação de recebimento ou de reserva conforme a regra operacional. Não prometer reserva confirmada quando ainda depender de aprovação.
Página de sucesso com protocolo, unidade, data, horário, número de pessoas e status.

6. PAINEL SAC

Campos: protocolo, cliente, WhatsApp, unidade, categoria, assunto, descrição, prioridade, status, responsável, data de abertura, prazo de atendimento, histórico de interações, resolução.
Categorias: Reclamação, Elogio, Sugestão, Dúvida, Problema com reserva, Atendimento, Outros.
Status: Aberto, Em andamento, Aguardando cliente, Resolvido, Encerrado.
Lista, filtros, detalhes e atribuição de responsável. Encaminhamento para atendimento humano, registrando tempo até a primeira resposta e resolução.

7. INTEGRAÇÃO COM TRYADE CRM

O Tryade CRM centraliza conversas, contatos e atuação do SDR. Criar arquitetura de integração REST e webhooks, com endpoints e chaves configuráveis. Deve permitir: receber evento de mensagem do WhatsApp; identificar contato pelo telefone normalizado; criar ou atualizar cliente; identificar intenção; classificar a conversa; preencher campos estruturados de reserva; criar ou consultar reservas; atualizar reservas existentes; registrar abertura e atualização de SAC; enviar eventos de volta ao CRM.
Classificações obrigatórias: Interesse em reserva, Reserva realizada, Consulta de reserva, Alteração de reserva, Cancelamento, SAC / reclamação, Elogio, Sugestão, Dúvida geral, Outros, Atendimento humano solicitado.
Registro por atendimento: ID da conversa externa, ID do contato externo, canal, intenção, classificação, unidade, resultado, origem, data de início, data de conclusão. Classificação principal e etiquetas adicionais.
Idempotência por event_id e external_id. Fila de eventos, registro de tentativas, mensagens de erro e reprocessamento.
Não presumir os endpoints reais do Tryade CRM: construir a interface e documentar o contrato esperado.

8. SDR DE WHATSAPP

Para reservas coletar: unidade, data, horário, quantidade de pessoas, nome e telefone. Nunca afirmar disponibilidade sem consultar o sistema. Em reclamações: registrar contexto, identificar unidade, criar protocolo, encaminhar ao responsável, não inventar soluções ou prazos, disponibilizar atendimento humano. Criar endpoint de consulta de disponibilidade e endpoint de criação de reservas para o SDR.

9. AUTOMAÇÕES DE WHATSAPP

Mensagens transacionais para os eventos: reserva solicitada, confirmada, alterada, cancelada, lembrete pré-reserva, SAC aberto, SAC resolvido, pesquisa de satisfação. Tabela de mensagens com cliente, reserva/protocolo, evento, template, status, ID externo, data prevista, envio, entrega, erro. Provedor WhatsApp configurável via API. Não inventar credenciais nem simular mensagens como enviadas. Fila com processamento seguro contra disparos duplicados. Consentimento, opt-out, janelas de atendimento e templates aprovados pela Meta.

10. MODELO DE DADOS

Migrations SQL para: organizations, units, user_profiles, user_unit_access, customers, reservations, reservation_capacity_rules, reservation_blocks, reservation_status_history, sac_tickets, sac_ticket_events, crm_contacts, crm_conversations, crm_events, customer_consents, message_templates, message_outbox, integration_settings, integration_event_logs, audit_logs.
Todas as tabelas operacionais com UUID, created_at, updated_at e relacionamentos consistentes. Credenciais somente em secrets, nunca em tabelas públicas nem no frontend. Índices por unidade, data, telefone e status.

11. RELATÓRIOS

Reservas (por dia, unidade, origem, pessoas, comparecimentos, cancelamentos, não comparecimentos), CRM (conversas, classificadas, interessados, reservas pelo SDR e pela landing, conversão por canal), SAC (abertos, resolvidos, tipos, tempo médio de resolução, pendências por unidade). Exportação CSV.

12. SEGURANÇA E LGPD

RLS em todas as tabelas necessárias; isolamento por unidade; acesso privilegiado somente pelo backend; autenticação obrigatória no painel; formulário público com proteção contra spam; rate limit nos endpoints públicos; validação de payloads e telefone; armazenamento mínimo necessário; aviso de privacidade; consentimentos registrados; logs de auditoria; nunca expor dados de outros clientes em consultas públicas; página pública de acompanhamento protegida por verificação segura.

13. UX/UI

Produto SaaS premium, profissional e simples, seguindo a DIRETRIZ DE DESIGN no topo. Desktop para gestores, mobile para funcionários, mobile-first na landing. Navegação lateral organizada, tabelas com filtros, calendário visual, estados vazios úteis, feedback de carregamento, erro e sucesso, acessibilidade. Não usar dados fictícios como se fossem resultados reais.

14. FASES

FASE 1: Banco de dados, segurança e autenticação.
FASE 2: Cadastro de unidades e regras de capacidade.
FASE 3: Landing page com criação real de reservas.
FASE 4: Painel de gestão de reservas.
FASE 5: SAC e protocolos.
FASE 6: Integração CRM e webhooks.
FASE 7: Automações de mensagens.
FASE 8: Dashboard e relatórios.
FASE 9: Testes e publicação.
Priorize um fluxo completo ponta a ponta. Não adicionar funcionalidades secundárias antes que reserva, persistência, consulta e atualização funcionem.

15. CRITÉRIOS DE ACEITE

O MVP só está operacional quando: o cliente solicita reserva pela página; a reserva aparece no painel real; as regras de capacidade impedem excesso; o gestor confirma ou cancela; o cliente abre SAC; os dados ficam salvos no Supabase; usuários sem permissão não acessam dados restritos; endpoints documentados para o SDR; integração CRM funciona se houver credenciais reais; envio WhatsApp funciona se provedor e templates estiverem configurados. Documente cada integração externa não configurada como pendente. Não marque como concluído algo não testado.

16. INSTRUÇÃO FINAL

Construa o sistema, não apenas um planejamento. Ao terminar cada fase, apresente: o que foi implementado, o que foi testado, o que está pendente, erros ou dependências externas. Decisões técnicas simples, escaláveis e compatíveis com Supabase. Nunca exponha credenciais. Objetivo: lançar a primeira versão operacional da Rede Cadeeiro o mais rápido possível, preservando segurança, integridade das reservas e facilidade de uso.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4f8556c0-dd27-47e6-adf2-687237d3b635).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
