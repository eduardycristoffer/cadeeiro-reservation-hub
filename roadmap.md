# Revisão de experiência e funcionamento

- [x] Compactar a reserva pública e manter ações visíveis no celular.
- [x] Corrigir navegação e conteúdo que ultrapassam a tela no painel.
- [x] Revisar formulários, falhas e estados de erro sem alterar regras no banco.
- [x] Verificar páginas e interações com sessão real, no celular e desktop.

Limites da verificação: nenhuma reserva ou pedido fictício foi gravado; confirmação/cancelamento de uma reserva real e envio ao CRM permanecem não verificados nesta revisão.

# Isolamento das chaves SDR por unidade

- [ ] Aplicar migration aditiva de unidades por chave preservando chaves antigas.
- [ ] Validar o escopo em todos os endpoints SDR, inclusive vínculos e protocolos.
- [ ] Adicionar seleção explícita de unidades na criação e listagem de chaves.
- [ ] Auditar consultas e RLS do painel, corrigindo vazamentos sem mudar o acesso existente às unidades.
- [ ] Atualizar documentação e OpenAPI.
- [ ] Executar testes de isolamento e compatibilidade e verificar o painel, sem publicar ou alterar unidades.