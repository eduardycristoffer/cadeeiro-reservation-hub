import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const agenda = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'A cada 15 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } } },
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
  config: { name: 'Buscar lembretes', parameters: { mode: 'runOnceForAllItems', jsCode: "// Buscar lembretes: pede ao sistema as reservas que precisam de lembrete agora e monta o texto\nconst helpers = this.helpers;\nconst rows = $input.all().map((i) => i.json).filter((r) => r && r.chave);\nconst cfg = {};\nrows.forEach((r) => { cfg[r.chave] = String(r.valor === null || r.valor === undefined ? '' : r.valor).trim(); });\nif (cfg.ativo !== 'sim' || cfg.followup_ativo === 'nao') return [];\nconst base = String(cfg.api_base || '').replace(/\\/+$/, '');\nconst r = await helpers.httpRequest({ method: 'GET', url: base + '/followups/due?limit=20', headers: { Authorization: 'Bearer ' + cfg.api_key }, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 30000 });\nif (r.statusCode !== 200 || !r.body || !r.body.ok) return [];\nconst digits = (s) => String(s || '').replace(/@.*$/, '').replace(/\\D/g, '');\nconst variantes = (d) => {\n  const v = [d];\n  if (d.indexOf('55') === 0 && d.length === 13) v.push(d.slice(0, 4) + d.slice(5));\n  if (d.indexOf('55') === 0 && d.length === 12) v.push(d.slice(0, 4) + '9' + d.slice(4));\n  return v;\n};\nconst liberados = cfg.modo_teste === 'sim' ? String(cfg.numeros_teste || '').split(',').map(digits).filter(Boolean) : null;\nconst DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];\nconst inbox = Number(cfg.inbox_lembretes || String(cfg.caixas || '').split(',')[0]) || 0;\nconst out = [];\n(r.body.data || []).forEach((d) => {\n  const fone = digits(d.phone);\n  if (!fone) return;\n  if (liberados) { const meus = variantes(fone); if (!liberados.some((n) => variantes(n).some((x) => meus.indexOf(x) >= 0))) return; }\n  const p = String(d.date).split('-');\n  const dow = DIAS[new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay()];\n  const t = String(d.time || '');\n  const hh = t.slice(0, 2).replace(/^0/, '') + 'h' + (t.slice(3, 5) === '00' ? '' : t.slice(3, 5));\n  const nome = String(d.first_name || '').trim() || 'tudo bem';\n  const pessoas = d.party_size + (d.party_size === 1 ? ' pessoa' : ' pessoas');\n  const aniv = d.occasion === 'aniversario' && d.celebrant_name ? ' Vamos comemorar o aniversário de ' + d.celebrant_name + '!' : '';\n  const texto = d.kind === 'lembrete_vespera'\n    ? 'Oi, ' + nome + '! Passando para lembrar da sua reserva de amanhã (' + dow + ', ' + p[2] + '/' + p[1] + ') na ' + d.unit_name + ': ' + hh + ', para ' + pessoas + '.' + aniv + '\\n\\nEstá tudo certo para vocês virem? Se precisar mudar ou cancelar, é só me avisar por aqui.'\n    : 'Oi, ' + nome + '! Lembrete da sua reserva de hoje na ' + d.unit_name + ', às ' + hh + ', para ' + pessoas + '. Estamos esperando vocês!' + aniv + '\\n\\nSe tiver algum imprevisto, me avise por aqui.';\n  out.push({ json: { kind: d.kind, protocol: d.protocol, phone: fone, nome: d.first_name || '', conv_id: d.conversation_external_id ? String(d.conversation_external_id) : '', texto: texto, unit: d.unit_name,\n    inbox_id: inbox, cfg: { crm_base: cfg.crm_base, crm_conta: cfg.crm_conta, api_base: base, api_key: cfg.api_key, bot_id: cfg.bot_id || '' } } });\n});\nreturn out;\n" } },
  output: [{ kind: 'lembrete_vespera', protocol: 'CAD-261028-ABCDE', phone: '5562993275525', nome: 'Eduardo', conv_id: '', texto: 'Oi!', unit: 'Candeeiro Goiania', inbox_id: 49, cfg: {} }],
});
const temConversa = ifElse({
  version: 2.2,
  config: {
    name: 'Ja tem conversa?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.conv_id }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
const buscarContato = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: 'Buscar contato no CRM',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.cfg.crm_base }}/api/v1/accounts/{{ $json.cfg.crm_conta }}/contacts/search?q={{ $json.phone }}'),
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
  config: { name: 'Achar contato', parameters: { mode: 'runOnceForEachItem', jsCode: "// Achar contato: pega o primeiro contato da busca no CRM\nconst base = $('Buscar lembretes').item.json;\nconst r = $input.item.json || {};\nconst corpo = r.body || r;\nconst lista = Array.isArray(corpo.payload) ? corpo.payload : [];\nconst c = lista.find((x) => x && x.id) || null;\nreturn { json: Object.assign({}, base, { contact_id: c ? c.id : null }) };\n" } },
  output: [{ kind: 'lembrete_vespera', protocol: 'CAD-261028-ABCDE', phone: '5562993275525', conv_id: '', contact_id: 1 }],
});
const temContato = ifElse({
  version: 2.2,
  config: {
    name: 'Tem contato?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ !!$json.contact_id }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
const criarContato = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: 'Criar contato',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.cfg.crm_base }}/api/v1/accounts/{{ $json.cfg.crm_conta }}/contacts'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ inbox_id: $json.inbox_id, name: ($json.nome || "Cliente"), phone_number: "+" + $json.phone }) }}'),
      options: { timeout: 25000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200, body: {} }],
});
const guardarContato = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Guardar contato', parameters: { mode: 'runOnceForEachItem', jsCode: "// Guardar contato: id do contato recem criado\nconst base = $('Buscar lembretes').item.json;\nconst r = $input.item.json || {};\nconst corpo = r.body || r;\nconst c = (corpo.payload && corpo.payload.contact) || corpo.contact || corpo.payload || {};\nreturn { json: Object.assign({}, base, { contact_id: c.id || null }) };\n" } },
  output: [{ kind: 'lembrete_vespera', protocol: 'CAD-261028-ABCDE', phone: '5562993275525', conv_id: '', contact_id: 1 }],
});
const criarConversa = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: 'Criar conversa',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.cfg.crm_base }}/api/v1/accounts/{{ $json.cfg.crm_conta }}/conversations'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ inbox_id: $json.inbox_id, contact_id: $json.contact_id, status: "open" }) }}'),
      options: { timeout: 25000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200, body: {} }],
});
const guardarConversa = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Guardar conversa', parameters: { mode: 'runOnceForEachItem', jsCode: "// Guardar conversa: id da conversa criada (ou da conversa aberta que o CRM informa quando ja existe uma)\nconst base = $('Buscar lembretes').item.json;\nconst r = $input.item.json || {};\nconst corpo = r.body || r;\nconst id = corpo && (corpo.id || corpo.conversation_id);\nreturn { json: Object.assign({}, base, { conv_id: id ? String(id) : '' }) };\n" } },
  output: [{ kind: 'lembrete_vespera', protocol: 'CAD-261028-ABCDE', phone: '5562993275525', conv_id: '7' }],
});
const enviar = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: 'Enviar lembrete',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.cfg.crm_base }}/api/v1/accounts/{{ $json.cfg.crm_conta }}/conversations/{{ $json.conv_id }}/messages'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify(Object.assign({ content: $json.texto, message_type: "outgoing", private: false, content_attributes: { sdr: true, followup: $json.kind } }, $json.cfg.bot_id ? { sender_type: "AgentBot", sender_id: Number($json.cfg.bot_id) } : {})) }}'),
      options: { timeout: 25000, batching: { batch: { batchSize: 1, batchInterval: 1500 } }, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200, body: {} }],
});
const marcar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Marcar no sistema', parameters: { mode: 'runOnceForEachItem', jsCode: "// Marcar no sistema: informa se o lembrete foi enviado (ou falhou) para nao repetir\nconst helpers = this.helpers;\nconst it = $('Buscar lembretes').item.json;\nconst r = $input.item.json || {};\nconst ok = r.statusCode >= 200 && r.statusCode < 300;\nlet marcado = 0;\ntry {\n  const x = await helpers.httpRequest({ method: 'POST', url: it.cfg.api_base + '/followups', headers: { Authorization: 'Bearer ' + it.cfg.api_key }, body: { protocol: it.protocol, kind: it.kind, ok: ok, error: ok ? null : ('CRM ' + (r.statusCode || 'sem resposta') + (it.conv_id ? '' : ' sem conversa')).slice(0, 200) }, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 20000 });\n  marcado = x.statusCode;\n} catch (e) { marcado = -1; }\nreturn { json: { quando: new Date().toISOString(), conv_id: String(it.conv_id || ''), telefone: it.phone, tipo: 'followup', msg_id: it.protocol, detalhe: JSON.stringify({ kind: it.kind, enviado: ok, marcado: marcado, unidade: it.unit }) } };\n" } },
  output: [{ quando: '2026-10-27T00:00:00.000Z', conv_id: '7', telefone: '5562993275525', tipo: 'followup', msg_id: 'CAD-261028-ABCDE', detalhe: '{}' }],
});
const registrar = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Registrar lembrete',
    parameters: {
      resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'id', value: 'QWR9jOdQ9KxGCoFM' },
      columns: { mappingMode: 'defineBelow', value: { quando: expr('{{ $json.quando }}'), conv_id: expr('{{ $json.conv_id }}'), telefone: expr('{{ $json.telefone }}'), tipo: expr('{{ $json.tipo }}'), msg_id: expr('{{ $json.msg_id }}'), detalhe: expr('{{ $json.detalhe }}') }, schema: [{ id: 'quando', displayName: 'quando', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'conv_id', displayName: 'conv_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'telefone', displayName: 'telefone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'tipo', displayName: 'tipo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'msg_id', displayName: 'msg_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'detalhe', displayName: 'detalhe', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }] },
    },
  },
  output: [{ id: 1 }],
});

export default workflow('candeeiro-followup-reservas', 'Candeeiro - Follow-up de reservas (lembretes)')
  .add(agenda)
  .to(lerConfig)
  .to(buscar)
  .to(temConversa
    .onTrue(enviar)
    .onFalse(buscarContato
      .to(acharContato)
      .to(temContato
        .onTrue(criarConversa)
        .onFalse(criarContato.to(guardarContato).to(criarConversa)))))
  .add(criarConversa)
  .to(guardarConversa)
  .to(enviar)
  .to(marcar)
  .to(registrar);
