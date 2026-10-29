# Integração Candeeiro ↔ Tryade CRM ↔ SDR (n8n)

## Arquitetura

```text
Cliente (WhatsApp)
      │
      ▼
Tryade CRM (Chatwoot)  ── webhook ──►  POST /api/public/crm/webhook/{token}   (entrada)
      ▲                                       │ crm_events (inbound, idempotente)
      │ API REST (token em secret)            ▼
      └──── worker /api/public/crm/worker ◄── crm_events (outbound, fila)
                    ▲ a cada minuto
SDR (n8n + OpenAI) ── Bearer <chave> ──► /api/public/sdr/*  (ferramentas)
```

- Este sistema é a **fonte da verdade** de reservas e SAC. O SDR nunca afirma disponibilidade sem chamar `/availability`.
- Toda escrita passa por funções do banco que só o servidor executa (`sdr_*`, `crm_*`). Mesmas regras de capacidade,
  bloqueio, antecedência e lock transacional da reserva pública.
- Alterações feitas no painel (confirmar, cancelar, alterar) geram eventos `reservation.status_changed` /
  `reservation.updated` automaticamente (gatilho no banco); mudança de status do SAC gera `sac.status_changed`.

## Autenticação do SDR

`Authorization: Bearer cdk_...` — chave criada em **Painel → Integrações → SDR (n8n)**. A chave aparece uma única vez;
o banco guarda só o hash SHA-256. Escopos: `read` (GET) e `write` (POST/PATCH). Limite: 300 requisições a cada 10 minutos por chave.

`Idempotency-Key` (opcional, 8–128 caracteres) em `POST /reservations`, `PATCH /reservations/{protocol}`, `POST /sac`, `POST /handoff`:
mesma chave + mesmo corpo em até 24h devolve a resposta original; corpo diferente → `409 IDEMPOTENCY_CONFLICT`.
Sugestão no n8n: `{{conversation_id}}-{{acao}}-{{n}}`.

### Chave por unidade (migração 008)

- `api_key_units` associa cada chave às suas unidades; **nenhuma linha = todas as unidades**, preservando chaves antigas.
- `sdr_auth` devolve `unit_ids`; somente o servidor valida esse escopo. Não basta limitar o prompt.
- `admin_create_api_key` aceita `_unit_ids` opcional: a assinatura antiga continua válida; a nova recebe o terceiro argumento explicitamente. Omitir equivale a `null` (todas), sem ambiguidade entre assinaturas no Data API.
- `/units`, `/context`, reservas/delivery por telefone e follow-ups só retornam unidades permitidas. Os follow-ups são filtrados antes do limite.
- Unidade fora do escopo é indistinguível de inexistente. PATCH e marcação de lembretes de outra unidade retornam `RESERVATION_NOT_FOUND`.
- SAC/handoff sem unidade continuam permitidos, mas não podem modificar conversas ou vincular protocolos de outra unidade.
- Classificação valida a unidade, a conversa existente e os protocolos vinculados; idempotência também revalida escopo antes do replay.

#### Criar a chave somente de Goiânia

1. Entre como super admin em **Integrações → SDR (n8n)**.
2. Nomeie a chave `SDR Goiânia`; mantenha leitura e, se necessário, escrita.
3. Em **Unidades que esta chave atende**, marque somente **Candeeiro Goiânia**; não marque **Todas as unidades**.
4. Crie e copie a chave uma única vez para a credencial/configuração do fluxo de Goiânia no n8n, inclusive follow-up.
5. Mapeie a caixa de Goiânia à unidade correta e confira `/units` e `/context`. Um mapeamento de Anápolis será ignorado por essa chave.
6. Teste valores, disponibilidade, consulta de reservas e a rejeição de um protocolo de outra unidade antes de ativar o fluxo.

#### Anápolis depois (não implantado nesta alteração)

Repita esses passos futuramente com uma **nova** chave `SDR Anápolis`, marcando somente **Candeeiro Anápolis**.
Use credencial, caixa e fluxo/configuração próprios; não reutilize a chave de Goiânia. Nenhuma chave ou implantação de Anápolis foi criada.
O app/API precisa ser publicado antes de trocar a credencial do n8n que chama o domínio de produção.

### Isolamento do painel (migração 009)

`can_access_unit` e `can_manage_unit` permanecem inalteradas. Contadores, filtros, exportação de reservas e joins usam o cliente autenticado e RLS.
Contatos CRM agora exigem conversa em unidade gerenciável; a atribuição de SAC não permite atravessar unidades.
Clientes exclusivos do delivery aparecem apenas em pedidos de unidades autorizadas. Leads, Integrações e Equipe seguem exclusivos do super admin.
Feriados são um calendário compartilhado da organização (não possuem unidade): leitura permanece compartilhada, edição agora exclusiva do super admin.

## Formato das respostas

Sucesso: `{"ok": true, "data": {...}, "mensagem_sugerida": "..."}`
Erro: `{"ok": false, "error": {"code": "SLOT_UNAVAILABLE", "message": "Esse horário não tem vaga..."}}`

`mensagem_sugerida` nunca diz que a reserva está confirmada quando o status é `pendente` e nunca promete prazo ou solução no SAC.

| Código | HTTP | Quando |
|---|---|---|
| UNAUTHORIZED | 401 | chave ausente, inválida ou revogada |
| FORBIDDEN_SCOPE | 403 | chave sem escopo `write` |
| RATE_LIMITED | 429 | limite da chave |
| VALIDATION_ERROR | 422 | corpo/consulta inválidos |
| INVALID_PHONE / INVALID_NAME / INVALID_PARTY_SIZE / NOTES_TOO_LONG / INVALID_SUBJECT / SUMMARY_TOO_LONG / REASON_REQUIRED / NOTHING_TO_CHANGE | 422 | regra de dado |
| UNIT_UNAVAILABLE / UNIT_NOT_FOUND / RESERVATION_NOT_FOUND / SAC_NOT_FOUND | 404 | não encontrado (protocolo de outro telefone também cai aqui) |
| SLOT_UNAVAILABLE | 409 | sem vaga no momento da gravação |
| INVALID_TRANSITION | 409 | reserva já cancelada/concluída |
| IDEMPOTENCY_CONFLICT / IDEMPOTENCY_IN_PROGRESS | 409 | reuso da Idempotency-Key |
| INTERNAL_ERROR | 500 | erro inesperado (pode repetir) |

## Endpoints (base `https://candeeiro.tryade.com.br/api/public/sdr`)

### GET /units
```json
{"ok":true,"data":[{"id":"uuid","slug":"centro","name":"Unidade Centro","address":"...","city":"São Paulo",
 "large_group_threshold":10,"max_advance_days":60,"min_advance_minutes":60,"auto_confirm":false,
 "hours":[{"weekday":5,"start":"18:00","end":"23:00","shift":"Noite"}]}]}
```
`weekday`: 0 = domingo.

### GET /availability
`?unit_slug=centro&date=2026-11-20&party_size=4` →
```json
{"ok":true,"data":{"unit_id":"uuid","date":"2026-11-20","party_size":4,"slots":[{"time":"20:00","remaining_seats":16}]}}
```
`?unit_id=uuid&from=2026-11-01&to=2026-11-30&party_size=4` → `{"data":{"dates":["2026-11-01", "..."]}}` (máx. 60 dias).

### POST /reservations
```json
{"unit_id":"uuid","date":"2026-11-20","time":"20:00","party_size":4,"full_name":"Maria Silva","phone":"11987654321",
 "notes":"aniversário","whatsapp_opt_in":true,"conversation_external_id":"123","contact_external_id":"456"}
```
`201` →
```json
{"ok":true,"data":{"protocol":"CAD-261120-A1B2C","status":"pendente","unit_name":"Unidade Centro","date":"2026-11-20",
 "time":"20:00","party_size":4,"is_large_group":false,"whatsapp_consent_registered":true},
 "mensagem_sugerida":"Recebemos sua solicitação de reserva: ... Ela ainda não está confirmada: a unidade vai analisar o pedido e o retorno virá por aqui."}
```
Origem `sdr_whatsapp`. Status: `confirmada` só se a unidade tem confirmação automática e não é grupo grande; senão `pendente`.
Consentimento transacional registrado com fonte `sdr_whatsapp`, exceto se o cliente fez opt-out. Nome de cliente existente não é sobrescrito.

### GET /reservations
`?phone=11987654321[&protocol=CAD-...]` → só reservas desse telefone, futuras ou dos últimos 30 dias.

### PATCH /reservations/{protocol}
Alterar: `{"action":"alterar","phone":"11987654321","date":"2026-11-21","time":"21:00","party_size":6}` (qualquer combinação).
Cancelar: `{"action":"cancelar","phone":"11987654321","reason":"imprevisto"}`.
O telefone precisa ser o dono da reserva. Capacidade é revalidada com lock. Reserva confirmada que vira grupo grande volta para `pendente`.

### POST /sac
```json
{"category":"reclamacao","subject":"Demora no atendimento","description":"...","unit_id":"uuid","phone":"11987654321",
 "full_name":"Maria Silva","priority":"media","human_requested":false,"conversation_external_id":"123"}
```
`201` → `{"data":{"protocol":"SAC-261026-9F3A1","status":"aberto"},"mensagem_sugerida":"Registramos sua solicitação com o protocolo ..."}`.
O prazo interno (SLA, padrão 48h por categoria, configurável em `integration_settings` provider `sac_sla`, `config.hours.<categoria>`) **não** é devolvido nem comunicado ao cliente.

### POST /conversations/classify
```json
{"external_id":"123","classification":"interesse_reserva","intent":"reservar sexta","tags":["aniversario"],
 "unit_id":"uuid","result":"reserva_criada","summary":"Cliente quis mesa para 4","reservation_protocol":"CAD-...",
 "contact_external_id":"456","phone":"11987654321","started_at":"2026-10-26T18:00:00-03:00"}
```
Classificações: `interesse_reserva, reserva_realizada, consulta_reserva, alteracao_reserva, cancelamento, sac_reclamacao, elogio, sugestao, duvida_geral, outros, atendimento_humano`.
Idempotente por `external_id` (etiquetas são somadas).

### POST /handoff
`{"conversation_external_id":"123","phone":"11987654321","full_name":"Maria","reason":"quer falar com gerente"}` →
marca a conversa como `atendimento_humano`, abre SAC (se não houver um aberto na conversa) e enfileira etiqueta + nota privada no CRM.

### GET /openapi.json
Especificação OpenAPI 3 (sem autenticação).

## Webhook do Chatwoot (entrada)

1. Painel → Integrações → Tryade CRM → **Gerar token** e copie a URL (só aparece uma vez).
2. No Chatwoot: Configurações → Integrações → Webhooks → Adicionar: cole a URL e marque
   `conversation_created`, `conversation_status_changed`, `conversation_updated`, `message_created`, `contact_created`, `contact_updated`.
3. (Opcional) Se o Chatwoot gerar segredo de assinatura, salve-o no secret `TRYADE_CRM_WEBHOOK_HMAC_SECRET`. Com ele presente,
   exigimos `X-Chatwoot-Signature: sha256=HMAC(segredo, "{timestamp}.{corpo}")` e `X-Chatwoot-Timestamp` (tolerância 5 min).

Regras: token inválido → `401` sem detalhes. Integração desativada → `200 ignored`. `event_id` = `evento:tipo:id:carimbo`, reenvio → `200 duplicate`.
Não guardamos o texto das mensagens (só contagem e `last_message_at`). Cliente só é vinculado se já existir pelo telefone.
Mensagem recebida exatamente `PARAR`, `SAIR` ou `STOP` (ignorando maiúsculas e espaços) registra opt-out no cliente existente.
Falha de processamento marca o evento como `falhou` e o Chatwoot ainda recebe `200`.

## Saída para o CRM (worker)

Rota `/api/public/crm/worker`, chamada a cada minuto pelo agendador do backend (autenticação gerenciada).
Pega até 5 eventos (`FOR UPDATE SKIP LOCKED`), backoff exponencial (2, 4, 8... min, máx. 4h), 8 tentativas e então `falhou`.
Para cada evento: localiza/cria o contato pelo telefone, atualiza atributos (`reserva_protocolo`, `reserva_status`, `reserva_unidade`,
`reserva_data`, `reserva_horario`, `reserva_pessoas`, `sac_protocolo`, `sac_status`), aplica etiquetas
(`reserva-pendente`, `reserva-confirmada`, `reserva-cancelada`, `sac-aberto`, `atendimento-humano`) e adiciona nota privada na conversa.
Sem configuração completa, o worker não toca na fila: os eventos ficam **pendentes**. Cada tentativa vai para `integration_event_logs`.

Crie no Chatwoot os atributos personalizados de contato com essas chaves e as etiquetas acima antes de ativar.

## Importar no n8n

1. Crie a chave em Integrações → SDR. No n8n: Credentials → *Header Auth* (`Authorization` = `Bearer cdk_...`).
2. Use o nó **HTTP Request** com "Import cURL" dos exemplos da tela, ou importe `openapi.json` como ferramenta do agente
   (AI Agent → Tool → HTTP Request / OpenAPI). Cada `operationId` vira uma ferramenta.
3. Instrua o agente a sempre repassar `mensagem_sugerida` e nunca inventar disponibilidade, prazo ou solução.

## PENDENTE

- Instância do Candeeiro no Tryade CRM (URL base e ID da conta).
- Secret `TRYADE_CRM_API_TOKEN` (token de acesso de um agente/bot do Chatwoot).
- Token do webhook gerado no painel e cadastrado no Chatwoot; opcional `TRYADE_CRM_WEBHOOK_HMAC_SECRET`.
- Atributos personalizados e etiquetas criados no Chatwoot; mapeamento caixa de entrada → unidade.
- Publicar o app: o agendador do worker chama o endereço publicado.
- Fluxo do SDR no n8n (fora deste sistema).
- Envio de mensagens WhatsApp pelo sistema (Fase 7): a reserva pelo SDR não enfileira mensagem própria; o SDR responde na conversa.
- Teste ponta a ponta com Chatwoot real (não executado: não há instância).
