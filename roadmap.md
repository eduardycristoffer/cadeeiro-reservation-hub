# Revisão de experiência e funcionamento

- [x] Compactar a reserva pública e manter ações visíveis no celular.
- [x] Corrigir navegação e conteúdo que ultrapassam a tela no painel.
- [x] Revisar formulários, falhas e estados de erro sem alterar regras no banco.
- [x] Verificar páginas e interações com sessão real, no celular e desktop.

Limites da verificação: nenhuma reserva ou pedido fictício foi gravado; confirmação/cancelamento de uma reserva real e envio ao CRM permanecem não verificados nesta revisão.

# Isolamento das chaves SDR por unidade

- [x] Aplicar migrations 008 e 009, preservando chaves antigas e helpers de acesso às unidades.
- [x] Validar o escopo em todos os endpoints SDR, inclusive vínculos, protocolos e replay.
- [x] Adicionar seleção explícita de unidades na criação e listagem de chaves.
- [x] Auditar consultas e RLS do painel e corrigir contatos CRM/SAC; feriados permanecem compartilhados com edição só pelo super admin.
- [x] Atualizar documentação e OpenAPI.
- [x] Executar testes de isolamento e compatibilidade: 59 testes SDR, 126 totais aprovados; sem publicar ou alterar unidades.
- [ ] Verificar criação/leitura de uma chave restrita no painel com sessão real: sem sessão disponível; tentativa de acesso automático não encontrou conta correspondente ao solicitante. Requer login na prévia. Nenhuma chave real foi criada, nem n8n alterado; testes SDR usam clientes de banco simulados, não gravam reservas/delivery reais.
# Etapa 1 de 4 — Mobile, aprovação em 1 toque e polimento

- [x] Barra inferior no celular (Início, Reservas, Aprovações com contador, Mais).
- [x] Tela Aprovações com Aprovar/Recusar, desfazer em 8 s e aprovação em lote.
- [x] Reservas: cards no celular, filtros em painel, calendário em faixa de dias.
- [x] Detalhe da reserva em painel inferior com ações fixas e menu "⋯".
- [x] Início com resumo do dia, pendências e atalhos.
- [x] /reservar em duas colunas no computador; avisos do que falta preencher.
- [x] Cores de status padronizadas; texto "Grupo grande acima de N pessoas".
- [ ] Testar o painel logado no celular: banco indisponível no momento do teste.
- [ ] Alterar horário de reserva: não existe ação para isso no banco (fica para etapa com banco).

# Etapa 2 — Usuários individuais e histórico
- [x] Convite (sem cadastro aberto), Equipe para gestor, primeiro acesso, Meu perfil
- [x] audit_log append-only, login/logout/bloqueio, /admin/historico, histórico na reserva

# Etapa 3 — SAC e relatórios
- [ ] Migration 011 (SAC: categorias/prioridade/SLA/eventos; RPCs de relatório por unidade)
- [ ] /admin/sac (kanban/cards, filtros, detalhe, criar, reabrir, indicadores)
- [ ] /admin/relatorios (abas, consolidado imprimível, CSV)
- [ ] Navegação com SAC (badge) e Relatórios
