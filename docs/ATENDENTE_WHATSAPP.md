# Atendente de WhatsApp (n8n + OpenAI) — Rede Candeeiro

O atendente responde no WhatsApp pelo Tryade CRM (conta 15, "Rede Candeeiro"), consulta e grava tudo neste sistema
(valores, disponibilidade, reservas, SAC, delivery) e nunca inventa informação: valor, horário e vaga só saem das
ferramentas. Este documento é o mapa: o que existe, onde mudar cada coisa, como testar e como replicar.

## Como funciona (resumo)

```text
cliente → WhatsApp (WAHA) → CRM (caixa 49) ──webhook message_created──▶ n8n "Atendente SDR"
n8n: filtra (modo teste/pausa) → espera 8 s (junta mensagens seguidas) → lê o histórico → monta as regras
     → OpenAI (ferramentas) ⇄ API deste sistema (/api/public/sdr/*) → resposta em até 3 mensagens
     → etiquetas + nota privada no CRM → registra a classificação aqui
n8n "Follow-up" (a cada 15 min): pede /followups/due → manda lembrete (véspera e dia) → marca /followups
```

- Unidade: Goiânia e Anápolis são operações separadas (serviços, valores e horários próprios). Se a caixa do CRM estiver
  mapeada a uma unidade (`crm_inbox_units`), o atendente já sabe; se não (caso da caixa de teste 49), ele pergunta
  a unidade dentre as devolvidas por `/context`, antes de falar de valores ou reservar. Com chave só de Goiânia,
  nunca oferece Anápolis, mesmo que o prompt ou a caixa de entrada indiquem outra unidade.
- Reserva: o atendente pega primeiro nome + telefone (o próprio WhatsApp), depois unidade/serviço, dia, pessoas, horário
  (consultando vagas de verdade), ocasião e pedidos. Resume e pede o ok antes de criar. As duas unidades confirmam
  automaticamente (a reserva já nasce **confirmada** e entra no follow-up). Se alguma unidade desligar isso, a reserva
  nasce **pendente** e o atendente diz isso (nunca "confirmada").
- Reclamação/elogio/sugestão: acolhe, registra no SAC (prioridade conforme gravidade), etiqueta `sac-aberto`, nota
  privada e, nas reclamações, encaminha para a equipe (`atendimento-humano`) e o bot fica quieto na conversa.
- Delivery: só nas unidades com delivery ligado (Painel > Unidades > Atendente de WhatsApp). Registra o pedido e a equipe
  acompanha em Painel > Delivery.
- Pessoa assumiu (respondeu na conversa, pelo painel do CRM **ou direto pelo celular** da linha): o bot pausa por 12 h
  (`pausa_humano_h`). Encaminhado pelo próprio atendente (reclamação, pedido de atendente): pausa 24 h (`pausa_handoff_h`).
  Falha técnica da IA (ex.: OpenAI sem créditos): encaminha, mas pausa só 30 min (`pausa_falha_min`), para o bot voltar
  sozinho quando o problema acabar. Para reativar antes, apague a linha da conversa na tabela `candeeiro_estado`.

## Onde mudar cada coisa

| O quê | Onde |
| --- | --- |
| Valores (por dia da semana, feriado, período, infantil), tabela do mês, promoção de um serviço | Painel > **Valores** |
| Serviços da unidade (churrasco, pizza, quilo, executivo), delivery, observações (brinquedoteca…) | Painel > Unidades > (unidade) > **Atendente de WhatsApp** |
| Horários e capacidade de reserva (almoço 11:00–15:00 a confirmar; última reserva do jantar às 20:30) | Painel > Unidades > (unidade) > horários |
| Confirmar reserva automaticamente | Painel > Unidades > (unidade) > "Confirmar automaticamente" (hoje ligado nas duas) |
| Ligar/desligar o bot, modo teste, números de teste, caixas, pausa, modelo | n8n > Data table `candeeiro_config` |
| Texto das regras do atendente | n8n > workflow "Atendente SDR" > nó **Montar prompt** (ou `regras_extra` na config para avisos temporários) |

Regra dos valores: para cada serviço vale a tabela **ativa** cujo período cobre a data, de **maior prioridade**. Uma tabela
só com um serviço (ex.: promoção de pizza) vale apenas para ele. Em feriado vale a linha "Feriados" da tabela; sem ela,
o dia da semana. Uma tabela sem datas é a "padrão" (prioridade 0). Feriados ficam em Painel > Valores > Feriados.

## Configuração (Data table `candeeiro_config`)

| chave | valor | para quê |
| --- | --- | --- |
| `ativo` | `sim` | Chave geral. Qualquer outro valor desliga atendente e follow-up. |
| `modo_teste` | `sim` | Responde **somente** a `numeros_teste`. Troque para `nao` para atender todos. |
| `numeros_teste` | `5562993275525` | Só dígitos, com 55 e DDD, separados por vírgula (a variação com/sem o 9 é aceita). |
| `caixas` | `49,50` | Ids das caixas do CRM atendidas (49 = WhatsApp de teste; 50 = simulador interno). |
| `crm_base` / `crm_conta` | `https://app.tryadecrm.com` / `15` | CRM e conta. |
| `bot_id` | `12` | Bot de agente "Atendente Candeeiro" (remetente das respostas). |
| `api_base` / `api_key` | `https://candeeiro.tryade.com.br/api/public/sdr` / `cdk_…` | API deste sistema e chave (Painel > Integrações). |
| `debounce_s` | `8` | Segundos esperando mensagens seguidas antes de responder. |
| `pausa_humano_h` / `pausa_handoff_h` | `12` / `24` (padrão) | Horas de pausa depois de pessoa responder / de encaminhar. |
| `pausa_falha_min` | `30` (padrão) | Minutos de pausa quando o encaminhamento foi por falha técnica da IA. |
| `modelo` | `gpt-4.1` | Modelo da OpenAI. |
| `regras_extra` | (vazio) | Aviso temporário somado às regras (ex.: "hoje o salão fecha às 18h"). |
| `followup_ativo` | (opcional) | `nao` desliga só os lembretes. |
| `inbox_lembretes` | (opcional) | Caixa usada para abrir conversa de lembrete (padrão: primeira de `caixas`). |

A OpenAI usa a credencial **rede candeeiro chatgpt sdr** (n8n). O CRM usa a credencial **Header Auth account 5** (a mesma do
SDR Shineray, que também enxerga a conta 15). A chave da API deste sistema fica na tabela de config (as execuções do n8n
guardam os dados dos nós: acesso ao n8n = acesso à chave; troque em Painel > Integrações se precisar revogar).

## Workflows no n8n (pasta "Candeeiro - Atendente SDR")

| Workflow | Id | Função |
| --- | --- | --- |
| Candeeiro - Atendente SDR (WhatsApp) | `5N7USrB320hbecUo` | Webhook do CRM → resposta. Webhook de produção: `https://n8n2.tryadecrm.com/webhook/candeeiro-atendente-5f3a9c1e7b2d4a68` (cadastrado no CRM, conta 15, evento `message_created`). |
| Candeeiro - rodada IA (OpenAI + ferramentas) | `Nf24mfJmZ5VruTd1` | Uma rodada: chama a OpenAI e executa as ferramentas na API. O principal chama até 4 rodadas. |
| Candeeiro - Follow-up de reservas (lembretes) | `ecv9JkMMipmGgoKe` | Agenda de 15 min: lembrete na véspera (10h–20h) e no dia (3h30 a 1h antes) das reservas **confirmadas** com WhatsApp autorizado. |
| Candeeiro - ajustar config (temporario) | `6HKcYMPxLgbMn2wL` | Utilitário para gravar uma linha da config. Pode apagar. |

O código-fonte dos três primeiros está em `n8n/*.workflow.ts` (SDK do n8n) para versionar e replicar.

Ferramentas do atendente: `consultar_valores`, `consultar_disponibilidade`, `criar_reserva`, `consultar_reservas`,
`alterar_reserva`, `cancelar_reserva`, `registrar_atendimento` (SAC), `chamar_atendente`, `registrar_delivery`,
`consultar_delivery`. Proteções fixas (no nó **Finalizar**): se a IA disser "confirmada" com reserva pendente, vale a
mensagem do sistema; se prometer prazo/solução em SAC, vale a mensagem do sistema; se a IA falhar, o cliente recebe um aviso
curto e a conversa vai para a equipe (nota privada com o motivo). Isso vale também se a sub-rotina de IA cair: a saída de erro das
rodadas 1–4 leva direto ao **Finalizar**, então o cliente nunca fica sem resposta.

## Replicar (outra instância do CRM / outra empresa)

### Restrição por chave: Goiânia agora, Anápolis depois

1. Como super admin, abra **Integrações → SDR (n8n)** e nomeie a chave `SDR Goiânia`.
2. Em **Unidades que esta chave atende**, escolha somente **Candeeiro Goiânia**. Não escolha **Todas as unidades**.
3. Crie a chave e copie-a imediatamente para a configuração/credencial do n8n de Goiânia, tanto atendente como follow-up.
4. Confira `/units`: só deve listar Goiânia; `/context` deve ignorar caixa mapeada para Anápolis (unidade/preços `null`).
5. Teste a rejeição de valores, disponibilidade, reservas, delivery e protocolos de Anápolis. O servidor aplica a restrição,
   independentemente do que a IA enviar; SAC/handoff sem unidade permanecem permitidos, sem acesso a conversas de outra unidade.
6. Publique a versão do app/API antes de usar a nova chave no domínio de produção; esta alteração **não publica** nem troca configurações no n8n.

Futuramente, crie outra chave `SDR Anápolis`, selecionando só **Candeeiro Anápolis**, e use configuração, caixa e credencial
separadas. **Não foi implantado nada de Anápolis agora.** A chave antiga sem restrição continua com todas as unidades;
não a revogue antes de validar a substituição. A opção explícita **Todas as unidades** cria esse mesmo comportamento legado.

Goiânia e Anápolis são empresas diferentes e podem ter CRM próprio. Para cada instância:

1. n8n: crie as 3 data tables (`candeeiro_config`, `candeeiro_estado`, `candeeiro_log`) e preencha a config (`crm_base`,
   `crm_conta`, `caixas`, `bot_id`, `api_key`, `modo_teste`…). Atualize os ids das tabelas nos `.workflow.ts`.
2. Duplique os 3 workflows (ou recrie a partir de `n8n/*.workflow.ts`), troque o `path` do webhook e o id da sub-rotina
   nos nós "Rodada 1–4", e escolha a credencial do CRM daquela instância.
3. CRM: crie o bot de agente, as etiquetas (`atendimento-humano`, `sac-aberto`, `reserva-pendente`,
   `reserva-confirmada`, `reserva-cancelada`, `delivery-pedido`) e o webhook (`message_created`) apontando ao n8n.
4. Este sistema: mapeie a caixa à unidade em `crm_inbox_units` (valor `conta:caixa`, ex.: `15:49`) para o atendente já
   saber a unidade, e confira serviços/delivery da unidade no painel.

## Roteiro de testes (modo teste, só o número liberado)

1. Valores sem unidade: "Quanto é o rodízio de pizza?" → usa somente as unidades de `/context`; chave de Goiânia nunca oferece Anápolis.
2. Valores por data: "E no sábado?" / "No feriado de 02/11?" → valor da tabela certa; criança → política infantil.
3. Churrasco em Goiânia → informa que lá não tem, sem consultar/oferecer Anápolis com chave restrita; delivery → só se a unidade tiver.
4. Reserva: dar nome, confirmar o número, dia, pessoas, horário, aniversário → resumo → "pode" → protocolo e "pendente".
5. Alterar e cancelar a reserva pelo protocolo.
6. Reclamação → empatia, SAC, etiqueta `sac-aberto` + `atendimento-humano`, bot fica quieto; resposta de uma pessoa também pausa.
7. Áudio → transcreve e responde. Pedir "falar com atendente" → encaminha.
8. Lembrete: reserva **confirmada** para amanhã (10h–20h) → véspera; no dia, 3h30 a 1h antes.

## Limites e pendências conhecidas

- Horários de reserva (iguais nas duas unidades): almoço 11:00–14:30 (janela de 11:00 a 15:00, **a confirmar**) e jantar de
  18:30 a 20:30 (última reserva às 20:30). Ajuste no painel.
- Delivery só em Goiânia. Rodízio de carnes e almoço executivo só em Anápolis.
- Almoço no quilo de Anápolis tem o mesmo valor todos os dias (R$ 79,90, inclusive feriados), na tabela do mês e na padrão.
- A tabela "do mês" vale até 31/10/2026; depois volta a valer a "padrão" (edite o período em Painel > Valores).
- Lembretes só saem para reservas **confirmadas** e de clientes que escreveram pelo WhatsApp (autorização registrada).
- O bot só abre conversa de lembrete em caixa do WhatsApp configurada; sem caixa (`caixas`), o lembrete falha e é
  reenviado até 3 vezes.
- O sistema também enfileira eventos para o CRM (`/api/public/crm/worker`) que escrevem etiquetas e notas; com a
  integração desativada em Painel > Integrações isso não duplica o que o n8n já faz.
