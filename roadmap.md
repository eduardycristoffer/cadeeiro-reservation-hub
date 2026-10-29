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