import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const agenda = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'A cada 3 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 3 }] } } },
  output: [{}],
});

const lerConfig = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Ler config', parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'PVRNDhN294z9AgFg' }, returnAll: true } },
  output: [{ chave: 'ativo', valor: 'sim' }],
});
const buscar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: "Buscar envios", parameters: { mode: 'runOnceForAllItems', jsCode: "// Buscar envios: pede ao sistema as mensagens de CRM prontas (follow-up, reaver, remarketing, avaliação do Google) e escolhe a caixa de cada uma\nconst helpers = this.helpers;\nconst rows = $input.all().map((i) => i.json).filter((r) => r && r.chave);\nconst cfg = {};\nrows.forEach((r) => { cfg[r.chave] = String(r.valor === null || r.valor === undefined ? '' : r.valor).trim(); });\nif (cfg.ativo !== 'sim' || cfg.crm_envios_ativo !== 'sim') return [];\nconst base = String(cfg.api_base || '').replace(/\\/+$/, '');\nconst auth = { Authorization: 'Bearer ' + cfg.api_key };\nconst r = await helpers.httpRequest({ method: 'GET', url: base + '/crm/sends/due?limit=10', headers: auth, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 30000 });\nif (r.statusCode !== 200 || !r.body || !r.body.ok) return [];\nconst digits = (s) => String(s || '').replace(/@.*$/, '').replace(/\\D/g, '');\nconst variantes = (d) => {\n  const v = [d];\n  if (d.indexOf('55') === 0 && d.length === 13) v.push(d.slice(0, 4) + d.slice(5));\n  if (d.indexOf('55') === 0 && d.length === 12) v.push(d.slice(0, 4) + '9' + d.slice(4));\n  return v;\n};\nconst liberados = cfg.modo_teste === 'sim' ? String(cfg.numeros_teste || '').split(',').map(digits).filter(Boolean) : null;\n// mensagem que não pode sair agora volta para a fila com o motivo (o sistema tenta de novo e, após 3 tentativas, mostra como falha no painel)\nconst recusar = async (id, motivo) => {\n  try { await helpers.httpRequest({ method: 'POST', url: base + '/crm/sends', headers: auth, body: { id: id, ok: false, error: motivo }, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 20000 }); } catch (e) { /* sem retorno: o sistema devolve a mensagem para a fila sozinho */ }\n};\nconst out = [];\nfor (const d of (r.body.data || [])) {\n  const fone = digits(d.phone);\n  const inbox = Number(cfg['inbox_envios_' + String(d.unit_slug || '')] || cfg.inbox_envios || 0) || 0;\n  if (!fone) { await recusar(d.id, 'telefone inválido'); continue; }\n  if (!inbox) { await recusar(d.id, 'caixa de entrada da unidade não configurada (inbox_envios_' + (d.unit_slug || 'unidade') + ')'); continue; }\n  if (liberados) {\n    const meus = variantes(fone);\n    if (!liberados.some((n) => variantes(n).some((x) => meus.indexOf(x) >= 0))) { await recusar(d.id, 'modo de teste: número não liberado'); continue; }\n  }\n  out.push({ json: { id: d.id, kind: d.kind, phone: fone, nome: d.first_name || '', texto: d.text, unit_slug: d.unit_slug || '', unit_name: d.unit_name || '', inbox_id: inbox,\n    cfg: { crm_base: cfg.crm_base, crm_conta: cfg.crm_conta, api_base: base, api_key: cfg.api_key, bot_id: cfg.bot_id || '' } } });\n}\nreturn out;\n" } },
  output: [{ id: 'a1b2c3d4-0000-0000-0000-000000000001', kind: 'avaliacao_google', phone: '5562993275525', nome: 'Eduardo', texto: 'Oi!', unit_slug: 'goiania', unit_name: 'Candeeiro Goiânia', inbox_id: 52, cfg: {} }],
});
const buscarContato = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: "Buscar contato no CRM",
    parameters: {
      method: 'GET',
      url: expr("{{ $json.cfg.crm_base }}/api/v1/accounts/{{ $json.cfg.crm_conta }}/contacts/search?q={{ $json.phone.slice(-8) }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 25000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200, body: {} }],
});
const acharContato = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: "Achar contato", parameters: { mode: 'runOnceForEachItem', jsCode: "// Achar contato: procura no CRM o contato desse telefone (com ou sem o 9) e guarda o id\nconst base = $('Buscar envios').item.json;\nconst r = $input.item.json || {};\nconst corpo = r.body || r;\nconst lista = Array.isArray(corpo.payload) ? corpo.payload : [];\nconst chave = (n) => { let d = String(n || '').replace(/\\D/g, ''); if (d.indexOf('55') === 0 && d.length >= 12) d = d.slice(2); return d.slice(0, 2) + d.slice(-8); };\nconst alvo = chave(base.phone);\nconst c = lista.find((x) => x && x.id && chave(x.phone_number) === alvo) || null;\nreturn { json: Object.assign({}, base, { contact_id: c ? c.id : null }) };\n" } },
  output: [{ id: 'a1b2c3d4-0000-0000-0000-000000000001', kind: 'avaliacao_google', phone: '5562993275525', inbox_id: 52, contact_id: 1 }],
});
const temContato = ifElse({
  version: 2.2,
  config: {
    name: "Tem contato?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr("{{ !!$json.contact_id }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
const criarContato = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: "Criar contato",
    parameters: {
      method: 'POST',
      url: expr("{{ $json.cfg.crm_base }}/api/v1/accounts/{{ $json.cfg.crm_conta }}/contacts"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ inbox_id: $json.inbox_id, name: ($json.nome || \"Cliente\"), phone_number: \"+\" + $json.phone }) }}"),
      options: { timeout: 25000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200, body: {} }],
});
const guardarContato = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: "Guardar contato", parameters: { mode: 'runOnceForEachItem', jsCode: "// Guardar contato: id do contato recém-criado no CRM\nconst base = $('Achar contato').item.json;\nconst r = $input.item.json || {};\nconst corpo = r.body || r;\nconst c = (corpo.payload && corpo.payload.contact) || corpo.contact || corpo.payload || {};\nreturn { json: Object.assign({}, base, { contact_id: c.id || null }) };\n" } },
  output: [{ id: 'a1b2c3d4-0000-0000-0000-000000000001', kind: 'avaliacao_google', phone: '5562993275525', inbox_id: 52, contact_id: 1 }],
});
const contatoPronto = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Contato pronto' },
  output: [{ id: 'a1b2c3d4-0000-0000-0000-000000000001', kind: 'avaliacao_google', phone: '5562993275525', inbox_id: 52, contact_id: 1 }],
});
const listarConversas = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: "Listar conversas do contato",
    parameters: {
      method: 'GET',
      url: expr("{{ $json.cfg.crm_base }}/api/v1/accounts/{{ $json.cfg.crm_conta }}/contacts/{{ $json.contact_id }}/conversations"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 25000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200, body: {} }],
});
const escolherConversa = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: "Escolher conversa", parameters: { mode: 'runOnceForEachItem', jsCode: "// Escolher conversa: usa a conversa mais recente desse contato na caixa da unidade (de preferência uma aberta)\nconst base = $('Contato pronto').item.json;\nconst r = $input.item.json || {};\nconst corpo = r.body || r;\nconst lista = Array.isArray(corpo.payload) ? corpo.payload : Array.isArray(corpo) ? corpo : [];\nconst daCaixa = lista.filter((c) => c && c.id && Number(c.inbox_id) === Number(base.inbox_id));\nconst abertas = daCaixa.filter((c) => c.status !== 'resolved');\nconst pool = (abertas.length ? abertas : daCaixa).slice().sort((a, b) => Number(b.id) - Number(a.id));\nreturn { json: Object.assign({}, base, { conv_id: pool[0] ? String(pool[0].id) : '' }) };\n" } },
  output: [{ id: 'a1b2c3d4-0000-0000-0000-000000000001', kind: 'avaliacao_google', phone: '5562993275525', inbox_id: 52, contact_id: 1, conv_id: '7' }],
});
const temConversa = ifElse({
  version: 2.2,
  config: {
    name: 'Tem conversa?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.conv_id }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
const criarConversa = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: "Criar conversa",
    parameters: {
      method: 'POST',
      url: expr("{{ $json.cfg.crm_base }}/api/v1/accounts/{{ $json.cfg.crm_conta }}/conversations"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ inbox_id: $json.inbox_id, contact_id: $json.contact_id, status: \"open\" }) }}"),
      options: { timeout: 25000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200, body: {} }],
});
const guardarConversa = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: "Guardar conversa", parameters: { mode: 'runOnceForEachItem', jsCode: "// Guardar conversa: id da conversa criada (ou da conversa aberta que o CRM informa quando já existe uma)\nconst base = $('Escolher conversa').item.json;\nconst r = $input.item.json || {};\nconst corpo = r.body || r;\nconst id = corpo && (corpo.id || corpo.conversation_id);\nreturn { json: Object.assign({}, base, { conv_id: id ? String(id) : '' }) };\n" } },
  output: [{ id: 'a1b2c3d4-0000-0000-0000-000000000001', kind: 'avaliacao_google', inbox_id: 52, contact_id: 1, conv_id: '7' }],
});
const conversaPronta = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Conversa pronta' },
  output: [{ id: 'a1b2c3d4-0000-0000-0000-000000000001', kind: 'avaliacao_google', inbox_id: 52, contact_id: 1, conv_id: '7' }],
});
const enviar = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: "Enviar mensagem",
    parameters: {
      method: 'POST',
      url: expr("{{ $json.cfg.crm_base }}/api/v1/accounts/{{ $json.cfg.crm_conta }}/conversations/{{ $json.conv_id }}/messages"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify(Object.assign({ content: $json.texto, message_type: \"outgoing\", private: false, content_attributes: { sdr: true, crm_send: $json.kind } }, $json.cfg.bot_id ? { sender_type: \"AgentBot\", sender_id: Number($json.cfg.bot_id) } : {})) }}"),
      options: { timeout: 25000, batching: { batch: { batchSize: 1, batchInterval: 8000 } }, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200, body: {} }],
});
const resultado = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: "Resultado do envio", parameters: { mode: 'runOnceForEachItem', jsCode: "// Resultado do envio: junta o que o CRM respondeu com os dados da mensagem\nconst it = $('Conversa pronta').item.json;\nconst r = $input.item.json || {};\nconst corpo = r.body || r;\nconst ok = r.statusCode >= 200 && r.statusCode < 300;\nreturn { json: Object.assign({}, it, { ok: ok, status: r.statusCode || 0, msg_id: ok && corpo && corpo.id ? String(corpo.id) : '', erro: ok ? '' : 'CRM ' + (r.statusCode || 'sem resposta') + (it.conv_id ? '' : ' sem conversa') }) };\n" } },
  output: [{ id: 'a1b2c3d4-0000-0000-0000-000000000001', kind: 'avaliacao_google', conv_id: '7', ok: true, status: 200, msg_id: '99', erro: '', cfg: {} }],
});
const marcar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: "Marcar no sistema", parameters: { mode: 'runOnceForEachItem', jsCode: "// Marcar no sistema: informa se a mensagem saiu (ou falhou) para o sistema dar baixa na fila e não repetir o envio\nconst helpers = this.helpers;\nconst it = $input.item.json;\nconst corpo = { id: it.id, ok: !!it.ok, error: it.ok ? null : String(it.erro || 'erro').slice(0, 300) };\nlet marcado = 0;\n// a baixa é repetida: se ela se perdesse, a mensagem voltaria para a fila e sairia duas vezes\nfor (let i = 0; i < 3 && !(marcado >= 200 && marcado < 300); i++) {\n  try {\n    const x = await helpers.httpRequest({ method: 'POST', url: it.cfg.api_base + '/crm/sends', headers: { Authorization: 'Bearer ' + it.cfg.api_key }, body: corpo, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 20000 });\n    marcado = x.statusCode;\n  } catch (e) { marcado = -1; }\n  if (!(marcado >= 200 && marcado < 300) && i < 2) await new Promise((res) => setTimeout(res, 1500));\n}\nreturn { json: Object.assign({}, it, { marcado: marcado, etiquetar: !!it.ok && it.kind === 'avaliacao_google' }) };\n" } },
  output: [{ id: 'a1b2c3d4-0000-0000-0000-000000000001', kind: 'avaliacao_google', conv_id: '7', ok: true, marcado: 200, etiquetar: true, cfg: {} }],
});
const etiquetar = ifElse({
  version: 2.2,
  config: {
    name: "Etiquetar?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr("{{ $json.etiquetar === true }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
const lerEtiquetas = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: "Ler etiquetas",
    parameters: {
      method: 'GET',
      url: expr("{{ $json.cfg.crm_base }}/api/v1/accounts/{{ $json.cfg.crm_conta }}/conversations/{{ $json.conv_id }}/labels"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200, body: {} }],
});
const montarEtiquetas = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: "Montar etiquetas", parameters: { mode: 'runOnceForEachItem', jsCode: "// Montar etiquetas: junta as etiquetas atuais da conversa com a do pedido de avaliação (o CRM troca a lista inteira ao gravar)\nconst it = $('Marcar no sistema').item.json;\nconst r = $input.item.json || {};\nconst corpo = r.body || r;\nconst lido = r.statusCode >= 200 && r.statusCode < 300;\nconst atuais = Array.isArray(corpo.payload) ? corpo.payload : Array.isArray(corpo) ? corpo : [];\nconst set = new Set(atuais);\nset.add('avaliacao-google');\nconst url = String(it.cfg.crm_base || '').replace(/\\/+$/, '') + '/api/v1/accounts/' + it.cfg.crm_conta + '/conversations/' + it.conv_id + '/labels';\nreturn { json: { pode: lido, url: url, labels: Array.from(set).sort() } };\n" } },
  output: [{ pode: true, url: 'https://app.tryadecrm.com/api/v1/accounts/15/conversations/7/labels', labels: ['avaliacao-google'] }],
});
const conseguiuLer = ifElse({
  version: 2.2,
  config: {
    name: "Conseguiu ler?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr("{{ $json.pode === true }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
const aplicarEtiquetas = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: 'Aplicar etiquetas',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.url }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ labels: $json.labels }) }}'),
      options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200, body: {} }],
});

export default workflow('candeeiro-crm-envios', 'Candeeiro - CRM envios (follow-up, reaver, remarketing, avaliacao Google)')
  .add(agenda)
  .to(lerConfig)
  .to(buscar)
  .to(buscarContato)
  .to(acharContato)
  .to(temContato
    .onTrue(contatoPronto)
    .onFalse(criarContato.to(guardarContato).to(contatoPronto)))
  .add(contatoPronto)
  .to(listarConversas)
  .to(escolherConversa)
  .to(temConversa
    .onTrue(conversaPronta)
    .onFalse(criarConversa.to(guardarConversa).to(conversaPronta)))
  .add(conversaPronta)
  .to(enviar)
  .to(resultado)
  .to(marcar)
  .to(etiquetar.onTrue(lerEtiquetas.to(montarEtiquetas).to(conseguiuLer.onTrue(aplicarEtiquetas))))
  .group('1. Buscar envios da fila', [lerConfig, buscar], {
    description: 'Lê a config e pede ao sistema as mensagens prontas. Só roda com crm_envios_ativo = sim e respeita o modo de teste.',
  })
  .group('2. Achar ou criar o contato', [buscarContato, acharContato, temContato, criarContato, guardarContato, contatoPronto], {
    description: 'Procura o telefone no CRM (com ou sem o 9); se não existir, cria o contato.',
  })
  .group('3. Achar ou criar a conversa', [listarConversas, escolherConversa, temConversa, criarConversa, guardarConversa, conversaPronta], {
    description: 'Usa a conversa do cliente na caixa da unidade (Goiânia ou Anápolis); se não houver, abre uma.',
  })
  .group('4. Enviar e dar baixa', [enviar, resultado, marcar], {
    description: 'Envia a mensagem pelo CRM, uma a cada 8 segundos, e avisa o sistema se saiu ou falhou (a baixa é repetida para não duplicar).',
  })
  .group('5. Etiquetar o pedido de avaliação', [etiquetar, lerEtiquetas, montarEtiquetas, conseguiuLer, aplicarEtiquetas], {
    description: 'Só para pedidos de avaliação do Google: soma a etiqueta avaliacao-google às que a conversa já tem.',
  });
