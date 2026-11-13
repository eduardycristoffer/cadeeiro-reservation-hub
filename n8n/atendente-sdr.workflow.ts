import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'Webhook CRM', parameters: { httpMethod: 'POST', path: 'candeeiro-atendente-5f3a9c1e7b2d4a68', responseMode: 'onReceived', options: {} } },
  output: [{ body: { event: 'message_created', account: { id: 15 }, inbox: { id: 49 }, message_type: 'incoming', private: false, content: 'Oi', conversation: { id: 1 }, sender: { id: 1, name: 'Cliente', phone_number: '+5562993275525' } } }],
});

const lerConfig = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Ler config', parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'PVRNDhN294z9AgFg' }, returnAll: true } },
  output: [{ chave: 'ativo', valor: 'sim' }],
});

const prefiltro = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Prefiltro', parameters: { mode: 'runOnceForAllItems', jsCode: "// Prefiltro: junta a configuracao e decide se o evento do CRM interessa ao atendente\nconst rows = $input.all().map((i) => i.json).filter((r) => r && r.chave);\nconst cfg = {};\nrows.forEach((r) => { cfg[r.chave] = String(r.valor === null || r.valor === undefined ? '' : r.valor).trim(); });\nconst w = $('Webhook CRM').first().json || {};\nconst b = (w.body && typeof w.body === 'object') ? w.body : w;\nconst out = { ok: false, motivo: '', tipo: '', conv_id: null, msg_id: null, inbox_id: null, phone: '', nome: '', contact_id: null, ts: 0, texto: '', cfg: cfg };\nconst fim = (m) => { out.motivo = m; return [{ json: out }]; };\nconst digits = (s) => String(s || '').replace(/@.*$/, '').replace(/\\D/g, '');\nconst variantes = (d) => {\n  const v = [d];\n  if (d.indexOf('55') === 0 && d.length === 13) v.push(d.slice(0, 4) + d.slice(5));\n  if (d.indexOf('55') === 0 && d.length === 12) v.push(d.slice(0, 4) + '9' + d.slice(4));\n  return v;\n};\n\nif (cfg.ativo !== 'sim') return fim('desligado');\nif (b.event !== 'message_created') return fim('evento:' + b.event);\nif (!b.account || Number(b.account.id) !== Number(cfg.crm_conta)) return fim('conta');\nconst inboxId = Number((b.inbox && b.inbox.id) || (b.conversation && b.conversation.inbox_id) || 0);\nconst caixas = String(cfg.caixas || '').split(',').map((x) => Number(x.trim())).filter(Boolean);\nif (caixas.indexOf(inboxId) < 0) return fim('caixa:' + inboxId);\nif (b.private === true) return fim('privada');\nconst conv = b.conversation || {};\nconst convId = conv.id || conv.display_id;\nif (!convId) return fim('sem_conversa');\n\nconst mt = b.message_type;\nconst entrada = mt === 'incoming' || mt === 0;\nconst saida = mt === 'outgoing' || mt === 1;\nif (!entrada && !saida) return fim('tipo:' + mt);\nconst meta = (conv.meta && conv.meta.sender) || {};\nconst sender = b.sender || {};\nconst contato = entrada ? Object.assign({}, meta, sender) : meta;\nconst ident = String(contato.identifier || '');\nif (/@(g\\.us|broadcast|newsletter)$/.test(ident)) return fim('grupo');\nconst phone = digits(contato.phone_number || ident);\nif (!phone) return fim('sem_telefone');\nif (cfg.modo_teste === 'sim') {\n  const liberados = String(cfg.numeros_teste || '').split(',').map(digits).filter(Boolean);\n  const meus = variantes(phone);\n  if (!liberados.some((n) => variantes(n).some((x) => meus.indexOf(x) >= 0))) return fim('fora_do_teste');\n}\n\nif (saida) {\n  const ca = (b.content_attributes && typeof b.content_attributes === 'object') ? b.content_attributes : {};\n  const tipoRem = String(sender.type || b.sender_type || '').toLowerCase().replace(/[^a-z]/g, '');\n  const eco = ca.external_echo === true || String(ca.external_echo_source || '') === 'app';\n  if (ca.sdr || tipoRem === 'agentbot') return fim('saida_bot');\n  // saudacao automatica do WhatsApp Business (mensagem de saudacao / ausencia): NAO e um humano assumindo\n  if (eco && /agradece\\s+(o\\s+|seu\\s+)?contato/i.test(String(b.content || ''))) return fim('saudacao_automatica');\n  if (!sender.id && !eco) return fim('saida_sistema');\n  out.tipo = 'saida_humana';\n} else {\n  out.tipo = 'entrada';\n}\nout.ok = true;\nout.conv_id = Number(convId);\nout.msg_id = Number(b.id || 0);\nout.inbox_id = inboxId;\nout.phone = phone;\nout.nome = String(contato.name || '');\nout.contact_id = Number(contato.id || 0) || null;\nout.ts = Number(b.created_at || 0);\nout.texto = String(b.content || '');\nreturn [{ json: out }];\n" } },
  output: [{ ok: true, tipo: 'entrada', conv_id: 1, phone: '5562993275525', cfg: {} }],
});
const passaPre = ifElse({
  version: 2.2,
  config: {
    name: 'Passa prefiltro?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
const ehCliente = ifElse({
  version: 2.2,
  config: {
    name: 'Mensagem do cliente?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.tipo }}'), operator: { type: 'string', operation: 'equals' }, rightValue: "entrada" }],
        combinator: 'and',
      },
    },
  },
});
const calcPausa = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Calcular pausa humana', parameters: { mode: 'runOnceForAllItems', jsCode: "// Calcula ate quando o bot fica quieto depois que uma pessoa respondeu na conversa\nconst pre = $('Prefiltro').first().json;\nconst horas = Number(pre.cfg.pausa_humano_h || 12);\nconst agora = new Date();\nreturn [{ json: { conv_id: String(pre.conv_id), telefone: pre.phone, pausado_ate: new Date(agora.getTime() + horas * 3600 * 1000).toISOString(), motivo: 'humano_respondeu', atualizado_em: agora.toISOString() } }];\n" } },
  output: [{ conv_id: '1', telefone: '5562993275525', pausado_ate: '2026-10-27T12:00:00.000Z', motivo: 'humano_respondeu', atualizado_em: '2026-10-27T00:00:00.000Z' }],
});
const gravarPausaHumano = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Gravar pausa humana',
    parameters: {
      resource: 'row', operation: 'upsert', dataTableId: { __rl: true, mode: 'id', value: 'N7VrcaSRz8VyFuYp' }, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'conv_id', condition: 'eq', keyValue: expr('{{ $json.conv_id }}') }] },
      columns: { mappingMode: 'defineBelow', value: { conv_id: expr('{{ $json.conv_id }}'), telefone: expr('{{ $json.telefone }}'), pausado_ate: expr('{{ $json.pausado_ate }}'), motivo: expr('{{ $json.motivo }}'), atualizado_em: expr('{{ $json.atualizado_em }}') }, schema: [{ id: 'conv_id', displayName: 'conv_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'telefone', displayName: 'telefone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'pausado_ate', displayName: 'pausado_ate', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'motivo', displayName: 'motivo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'atualizado_em', displayName: 'atualizado_em', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }] },
    },
  },
  output: [{ id: 1 }],
});

const lerEstado = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Ler estado da conversa',
    alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'N7VrcaSRz8VyFuYp' }, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'conv_id', condition: 'eq', keyValue: expr('{{ String($("Prefiltro").first().json.conv_id) }}') }] },
      returnAll: true,
    },
  },
  output: [{ conv_id: '1', pausado_ate: '2026-10-27T12:00:00.000Z', motivo: 'humano_respondeu' }],
});

const portao = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Portao', parameters: { mode: 'runOnceForAllItems', jsCode: "// Portao: o bot esta pausado nesta conversa (pessoa assumiu ou foi encaminhada)?\nconst pre = $('Prefiltro').first().json;\nconst rows = $input.all().map((i) => i.json).filter((r) => r && r.conv_id);\nconst agora = Date.now();\nlet motivo = '';\nrows.forEach((r) => { const t = Date.parse(r.pausado_ate || ''); if (t && t > agora) motivo = r.motivo || 'pausado'; });\nreturn [{ json: { seguir: !motivo, motivo: motivo ? 'pausa:' + motivo : '', conv_id: pre.conv_id } }];\n" } },
  output: [{ seguir: true, motivo: '', conv_id: 1 }],
});
const responder = ifElse({
  version: 2.2,
  config: {
    name: 'Responder?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.seguir }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
const debounce = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: { name: 'Juntar mensagens seguidas', parameters: { resume: 'timeInterval', amount: expr('{{ Number($("Prefiltro").first().json.cfg.debounce_s || 8) }}'), unit: 'seconds' } },
  output: [{}],
});

const lerMensagens = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: 'Ler mensagens',
    parameters: {
      method: 'GET',
      url: expr('{{ $("Prefiltro").first().json.cfg.crm_base }}/api/v1/accounts/{{ $("Prefiltro").first().json.cfg.crm_conta }}/conversations/{{ $("Prefiltro").first().json.conv_id }}/messages'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200, body: { payload: [] } }],
});

const analisar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Analisar conversa', parameters: { mode: 'runOnceForAllItems', jsCode: "// Analisar conversa: ainda sou a ultima mensagem do cliente? ja foi respondida? monta historico e audios\nconst pre = $('Prefiltro').first().json;\nconst r = $input.first().json || {};\nconst body = r.body || r;\nconst lista = (Array.isArray(body.payload) ? body.payload : Array.isArray(body) ? body : []).slice().sort((a, b) => (a.id || 0) - (b.id || 0));\nconst isIn = (m) => m.message_type === 0 || m.message_type === 'incoming';\nconst isOut = (m) => m.message_type === 1 || m.message_type === 'outgoing';\nconst reais = lista.filter((m) => !m.private && (isIn(m) || isOut(m)));\nlet ultima = null;\nreais.forEach((m) => { if (isIn(m)) ultima = m; });\nif (!ultima) return [{ json: { seguir: false, motivo: 'sem_mensagem_do_cliente', historico: [], audios: [] } }];\nconst respondida = reais.some((m) => isOut(m) && m.id > ultima.id);\nconst maisNova = pre.msg_id && ultima.id > pre.msg_id;\n// datas relativas: corrige hoje/amanhã/ontem frente a uma data dd/mm citada junto, tendo como referência o momento refMs\nconst pad2 = (n) => String(n).padStart(2, '0');\nconst spDate = (ms) => new Date(ms - 3 * 3600 * 1000);\nconst dmStr = (d) => pad2(d.getUTCDate()) + '/' + pad2(d.getUTCMonth() + 1);\nconst DIAS_SEM = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];\nconst corrigirRel = (txt, refMs) => {\n  const base = spDate(refMs);\n  const h = dmStr(base), a = dmStr(new Date(base.getTime() + 86400000)), o = dmStr(new Date(base.getTime() - 86400000));\n  return String(txt).replace(/\\b(hoje|amanh[ãa]|ontem)(\\s*[,(]?\\s*(?:[a-zçãé]+-feira,?\\s*)?\\(?)(\\d{1,2})\\/(\\d{1,2})/gi, (m, rel, sep, d, mo) => {\n    const k = pad2(d) + '/' + pad2(mo);\n    const novo = k === h ? 'hoje' : k === a ? 'amanhã' : k === o ? 'ontem' : null;\n    if (!novo) return m;\n    const cap = rel.charAt(0) === rel.charAt(0).toUpperCase() ? novo.charAt(0).toUpperCase() + novo.slice(1) : novo;\n    return cap + sep + d + '/' + mo;\n  });\n};\nconst hojeDm = dmStr(spDate(Date.now()));\nconst nomeAnexo = { audio: 'áudio', image: 'imagem', video: 'vídeo', file: 'arquivo', location: 'localização', contact: 'contato', sticker: 'figurinha' };\nconst texto = (m) => {\n  let t = String(m.content || '').trim();\n  const ca = m.content_attributes || {};\n  if (!t && ca.transcription) t = String(ca.transcription).trim();\n  const anexos = (m.attachments || []).map((a) => nomeAnexo[a.file_type] || a.file_type).filter(Boolean);\n  if (!t && anexos.length) t = '[' + (isIn(m) ? 'o cliente enviou ' : 'foi enviado ') + anexos.join(', ') + ']';\n  return t;\n};\nconst historico = [];\nreais.forEach((m) => {\n  let t = texto(m);\n  if (!t) return;\n  const role = isIn(m) ? 'user' : 'assistant';\n  const refMs = (Number(m.created_at) || 0) * 1000;\n  if (refMs) {\n    if (role === 'assistant') t = corrigirRel(t, refMs);\n    const dm = spDate(refMs);\n    if (dmStr(dm) !== hojeDm) t = '[de ' + DIAS_SEM[dm.getUTCDay()] + ' ' + dmStr(dm) + '] ' + t;\n  }\n  const ult = historico[historico.length - 1];\n  if (ult && ult.role === role) ult.content += '\\n' + t; else historico.push({ role: role, content: t });\n});\nconst audios = [];\nfor (let i = reais.length - 1; i >= 0; i--) {\n  const m = reais[i];\n  if (!isIn(m)) break;\n  (m.attachments || []).forEach((a) => { if (a.file_type === 'audio' && a.data_url && !(m.content_attributes || {}).transcription && !String(m.content || '').trim()) audios.push({ url: a.data_url, msg_id: m.id }); });\n}\nconst seguir = !respondida && !maisNova;\nreturn [{ json: { seguir: seguir, motivo: respondida ? 'ja_respondida' : maisNova ? 'mensagem_mais_nova' : '', historico: historico.slice(-30), audios: audios.slice(0, 3), ultima_msg_id: ultima.id } }];\n" } },
  output: [{ seguir: true, motivo: '', historico: [{ role: 'user', content: 'Oi' }], audios: [], ultima_msg_id: 1 }],
});
const seguir = ifElse({
  version: 2.2,
  config: {
    name: 'Seguir?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.seguir }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
const temAudio = ifElse({
  version: 2.2,
  config: {
    name: 'Tem audio?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ ($json.audios || []).length }}'), operator: { type: 'number', operation: 'gt' }, rightValue: 0 }],
        combinator: 'and',
      },
    },
  },
});
const separarAudios = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Separar audios', parameters: { mode: 'runOnceForAllItems', jsCode: "// Um item por audio a transcrever\nconst a = $('Analisar conversa').first().json.audios || [];\nreturn a.map((x) => ({ json: { url: x.url, msg_id: x.msg_id } }));\n" } },
  output: [{ url: 'https://exemplo/audio.ogg', msg_id: 1 }],
});
const baixarAudio = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: { name: 'Baixar audio', parameters: { method: 'GET', url: expr('{{ $json.url }}'), options: { timeout: 30000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } } } },
  output: [{}],
});

const nomearAudio = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Nomear audio', parameters: { mode: 'runOnceForAllItems', jsCode: "// A transcricao precisa de um nome de arquivo com extensao reconhecida\nreturn $input.all().map((it) => {\n  const b = it.binary && it.binary.data;\n  if (b) {\n    const mime = String(b.mimeType || '').toLowerCase();\n    const ext = mime.indexOf('mpeg') >= 0 ? 'mp3' : mime.indexOf('mp4') >= 0 || mime.indexOf('m4a') >= 0 || mime.indexOf('aac') >= 0 ? 'm4a' : mime.indexOf('wav') >= 0 ? 'wav' : mime.indexOf('webm') >= 0 ? 'webm' : 'ogg';\n    b.fileName = 'audio.' + ext;\n    b.fileExtension = ext;\n    if (!mime) b.mimeType = 'audio/ogg';\n  }\n  return it;\n});\n" } },
  output: [{}],
});
const transcrever = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: 'Transcrever audio',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.openai.com/v1/audio/transcriptions',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'multipart-form-data',
      bodyParameters: { parameters: [{ parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'data' }, { name: 'model', value: 'whisper-1' }, { name: 'language', value: 'pt' }] },
      options: { timeout: 60000 },
    },
    credentials: { httpHeaderAuth: { id: 'sfD9Ge8OEQb40JJi', name: 'rede candeeiro chatgpt sdr' } },
  },
  output: [{ text: 'Quero reservar para sabado' }],
});

const juntarTranscricoes = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Juntar transcricoes', parameters: { mode: 'runOnceForAllItems', jsCode: "// Junta o texto dos audios do cliente\nconst textos = $input.all().map((i) => String((i.json && i.json.text) || '').trim()).filter(Boolean);\nreturn [{ json: { audio_texto: textos.join(' ') } }];\n" } },
  output: [{ audio_texto: 'Quero reservar para sabado' }],
});
const montarPrompt = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Montar prompt', parameters: { mode: 'runOnceForAllItems', jsCode: "// Montar prompt: busca unidades/contexto no sistema e monta a chamada da OpenAI (regras + historico + ferramentas)\nconst helpers = this.helpers;\nconst pre = $('Prefiltro').first().json;\nconst cfg = pre.cfg || {};\nconst an = $('Analisar conversa').first().json;\nlet audioTexto = '';\ntry { audioTexto = String($('Juntar transcricoes').first().json.audio_texto || '').trim(); } catch (e) { audioTexto = ''; }\n\nconst api = { base: String(cfg.api_base || '').replace(/\\/+$/, ''), key: cfg.api_key || '' };\nconst get = async (path) => {\n  try {\n    const r = await helpers.httpRequest({ method: 'GET', url: api.base + path, headers: { Authorization: 'Bearer ' + api.key }, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 25000 });\n    return r.statusCode === 200 && r.body && r.body.ok ? r.body.data : null;\n  } catch (e) { return null; }\n};\n\nconst agoraSp = new Date(Date.now() - 3 * 3600 * 1000);\nconst iso = (d) => d.toISOString().slice(0, 10);\nconst DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];\nconst br = (d) => iso(d).slice(8, 10) + '/' + iso(d).slice(5, 7);\nconst hoje = DIAS[agoraSp.getUTCDay()] + ', ' + br(agoraSp) + '/' + agoraSp.getUTCFullYear() + ' (' + iso(agoraSp) + '), ' + agoraSp.toISOString().slice(11, 16) + ' no horário de Brasília';\nconst proximos = [];\nfor (let i = 0; i < 15; i++) { const d = new Date(agoraSp.getTime() + i * 86400000); proximos.push((i === 0 ? 'hoje' : i === 1 ? 'amanhã' : DIAS[d.getUTCDay()]) + ' ' + br(d) + ' = ' + iso(d)); }\n\nconst [contexto, unidades] = await Promise.all([get('/context?inbox=' + encodeURIComponent(cfg.crm_conta + ':' + pre.inbox_id)), get('/units')]);\nconst SERV = { rodizio_carnes: 'rodízio de churrasco (almoço)', rodizio_pizza: 'rodízio de pizza (jantar)', almoco_quilo: 'almoço no quilo', almoco_executivo: 'almoço executivo (somente buffet)' };\nconst lista = Array.isArray(unidades) ? unidades : [];\nconst mapeada = contexto && contexto.unidade ? contexto.unidade : null;\n// cidades: WhatsApp e localizacao de cada unidade (config) para orientar quem escreveu no numero errado\nconst CID = { goiania: { nome: 'Goiânia' }, anapolis: { nome: 'Anápolis' } };\nconst waLink = (slug) => { const d = String(cfg['whatsapp_' + slug] || '').replace(/\\D/g, ''); return d ? 'https://wa.me/' + d + '?text=' + encodeURIComponent('Olá! Quero falar com o Candeeiro ' + CID[slug].nome + '.') : ''; };\nconst cidades = {};\n['goiania', 'anapolis'].forEach((s) => { cidades[s] = { nome: CID[s].nome, whatsapp_link: waLink(s), maps: String(cfg['maps_' + s] || '') }; });\nconst atualSlug = mapeada && CID[mapeada.slug] ? mapeada.slug : null;\nconst outraSlug = atualSlug === 'goiania' ? 'anapolis' : atualSlug === 'anapolis' ? 'goiania' : null;\n// com a caixa mapeada o prompt so conhece a unidade da caixa; sem mapa (simulador) mostra as unidades que tem servicos\nconst visiveis = atualSlug ? lista.filter((u) => u.slug === atualSlug) : lista.filter((u) => (u.services || []).length);\nconst linhasUnidades = visiveis.map((u) => '- ' + u.name + ' (código: ' + u.slug + (u.city ? ', cidade: ' + u.city : '') + '): serviços: ' + ((u.services || []).map((s) => SERV[s] || s).join(', ') || 'não cadastrados') +\n  '. Delivery: ' + (u.has_delivery ? 'SIM' : 'NÃO') + '.' + (u.agent_notes ? ' Observações da unidade: ' + u.agent_notes : '') + (u.address ? ' Endereço: ' + u.address + '.' : '') + (u.phone ? ' Telefone: ' + u.phone + '.' : ''));\n\nconst nomeAtual = atualSlug ? CID[atualSlug].nome : '';\nconst nomeOutra = outraSlug ? CID[outraSlug].nome : '';\nconst trocaCidade = atualSlug ? [\n  '## Troca de cidade (este WhatsApp é só de ' + nomeAtual + ')',\n  'A outra unidade é ' + nomeOutra + ' (código: ' + outraSlug + ').',\n  cidades[outraSlug].whatsapp_link ? 'WhatsApp de ' + nomeOutra + ' (envie este link sozinho em uma linha, sem ponto final colado nele): ' + cidades[outraSlug].whatsapp_link : 'O WhatsApp de ' + nomeOutra + ' não está cadastrado: use chamar_atendente.',\n  cidades[outraSlug].maps ? 'Localização de ' + nomeOutra + ' (mesma regra do link): ' + cidades[outraSlug].maps : '',\n  '- O que decide a unidade é ONDE o cliente quer COMER, não onde ele mora. Quem mora em ' + nomeOutra + ' mas vai comer em ' + nomeAtual + ' é atendido normalmente aqui.',\n  '- Quando o cliente disser a cidade (onde mora ou onde quer comer), registre com a ferramenta definir_cidade. Só pergunte se houver sinal de que ele quer a outra unidade (pediu algo que só existe lá, citou a cidade ou o endereço dela): UMA pergunta leve, como: Você pretende comer em ' + nomeAtual + ' ou em ' + nomeOutra + '?',\n  '- Se ele quer comer em ' + nomeOutra + ': chame definir_cidade com quer_comer_em=' + outraSlug + '. Depois explique em 1 ou 2 frases que este número atende somente ' + nomeAtual + ', envie o link do WhatsApp de ' + nomeOutra + ' (e a localização, se ele pedir) e diga que lá a equipe passa os valores e faz a reserva. NÃO informe valores, cardápio nem reserve em ' + nomeOutra + ' aqui.',\n  '- A marcação da cidade só vale para quem é da cidade E vai comer nela: a ferramenta cuida disso. Passe mora_em e quer_comer_em exatamente como o cliente disse (mora_em = nao_informado se ele não disse).',\n  '- Se o cliente insistir em ser atendido aqui sobre ' + nomeOutra + ', repita o link uma vez e, se continuar, use chamar_atendente.',\n  '',\n].join('\\n') : '';\nconst regrasUnidade = atualSlug\n  ? String(cfg['regras_' + atualSlug] || '')\n  : ['goiania', 'anapolis'].map((s) => (cfg['regras_' + s] ? '### Se o cliente falar de ' + CID[s].nome + '\\n' + cfg['regras_' + s] : '')).filter(Boolean).join('\\n\\n');\nconst avisos = [cfg.regras_extra, regrasUnidade].filter(Boolean).join('\\n\\n');\n\nconst prompt = [\n  'Você é a atendente virtual da Rede Candeeiro (churrascaria e pizzaria) no WhatsApp. Fale em português do Brasil, com educação e naturalidade, como uma pessoa atenciosa da casa. Se perguntarem, diga que é a atendente virtual da Candeeiro.',\n  '',\n  '## Como conversar',\n  '- Seja consultiva: descubra o que a pessoa precisa antes de despejar informação. Faça UMA pergunta por vez.',\n  '- Respostas curtas (até 3 frases), sem listas longas e sem texto de panfleto. Responda só o que foi perguntado e proponha o próximo passo (ex.: Quer que eu já veja uma mesa para você?).',\n  '- Use o primeiro nome do cliente depois que souber. No máximo um emoji, e só quando combinar.',\n  '- Se precisar de mais de uma mensagem, separe em até 3 blocos com uma linha em branco entre eles (cada bloco vira uma mensagem de WhatsApp).',\n  '- Nunca peça CPF, cartão ou outros dados sensíveis. Não repita pergunta que o cliente já respondeu.',\n  '',\n  '## Verdade acima de tudo',\n  '- Só diga valores, horários, endereços, serviços, promoções e regras que vieram das ferramentas ou deste texto. NUNCA invente. Se não souber, diga que vai confirmar com a equipe e use chamar_atendente.',\n  '- VALORES: sempre pela ferramenta consultar_valores, na data de que o cliente fala (o valor muda por dia útil, sábado, domingo, feriado e por tabela do mês). Informe o valor do dia perguntado; mostre as outras linhas só se pedirem ou se ajudar a decidir. Lembre UMA vez na conversa que os valores estão sujeitos a alteração. Se o valor da data vier vazio, diga que não tem esse valor cadastrado para o dia e que vai confirmar com a equipe.',\n  '- CRIANÇAS: informe a política infantil (faixas de idade) do serviço escolhido quando houver criança no grupo ou quando perguntarem.',\n  '- Cada unidade é uma operação diferente, com serviços, valores e horários próprios. Ofereça somente o que a unidade escolhida tem. Nunca misture informações de Goiânia e Anápolis.',\n  '- Delivery só existe nas unidades com Delivery SIM. Se a unidade não faz delivery, diga com naturalidade e ofereça reserva ou informações.',\n  '- BRINQUEDOTECA: NUNCA mencione, ofereça ou sugira por conta própria (nem em perguntas de observação, nem como exemplo). Só fale dela se o cliente perguntar ou pedir; nesse caso confirme que existe e aí pode sugerir mesa próxima. Outras observações: confirme apenas o que estiver nas observações da unidade.',\n  '- Não informe horário de funcionamento por conta própria: use consultar_disponibilidade para saber os horários em que dá para reservar.',\n  '',\n  '## Unidades',\n  linhasUnidades.join('\\n') || '(não consegui carregar as unidades agora: use chamar_atendente se o cliente precisar de algo do sistema)',\n  mapeada ? 'Esta conversa chegou pelo número da unidade ' + mapeada.name + ' (código: ' + mapeada.slug + '). Atenda SOMENTE essa unidade, use sempre o código ' + mapeada.slug + ' nas ferramentas e não pergunte a unidade. Se o cliente quiser comer na outra unidade, siga a seção Troca de cidade.' : 'A unidade desta conversa AINDA NÃO FOI DEFINIDA. Antes de falar de valores, horários ou reserva, pergunte de qual unidade o cliente fala: Goiânia ou Anápolis. Se o cliente mudar de unidade, use a nova.',\n  '',\n  trocaCidade,\n  '## Reservas (seu foco)',\n  'Objetivo: reservar sem fricção, pegando as informações aos poucos, nesta ordem de prioridade:',\n  '1) Primeiro nome e telefone. O telefone é o WhatsApp desta conversa: confirme com o cliente (posso usar este número para a reserva?) em vez de pedir digitado. Peça nome e sobrenome para registrar a reserva.',\n  '2) Unidade e serviço (somente os que a unidade oferece).',\n  '3) Dia (hoje, amanhã, sábado... converta usando o calendário abaixo) e quantas pessoas (e se há crianças).',\n  '4) Horário: chame consultar_disponibilidade ANTES de oferecer horários e sugira 2 ou 3 opções reais. Nunca afirme que há vaga sem consultar.',\n  '5) Ocasião (aniversário? nome de quem faz aniversário) e pedidos especiais (cadeirão, bolo etc.; não cite brinquedoteca, só se o cliente pedir).',\n  'Antes de criar, resuma em uma frase (unidade, serviço, dia, horário, pessoas, nome) e peça o ok. Só então chame criar_reserva. Aproveite o que o cliente já disse sem perguntar de novo.',\n  'Depois de criar, use o status real devolvido: se for pendente, diga que a solicitação foi recebida e que a unidade confirma por aqui. NUNCA diga que está confirmada se o status não for confirmada. Informe o protocolo.',\n  'Alterar ou cancelar: use consultar_reservas, confirme com o cliente qual protocolo e só então chame alterar_reserva ou cancelar_reserva (para cancelar, peça confirmação antes). Grupos grandes são analisados pela unidade: não prometa mesa.',\n  '',\n  '## Reclamação, elogio e sugestão (SAC)',\n  '- Acolha com empatia em 1 ou 2 frases, sem se justificar e sem culpar ninguém. NUNCA prometa prazo, solução, reembolso, desconto ou punição.',\n  '- Colete o essencial em poucas perguntas (unidade, o que aconteceu, quando). Se o cliente já contou, não repita as perguntas.',\n  '- Registre com registrar_atendimento na categoria certa. Prioridade urgente para intoxicação, acidente, discriminação ou ameaça; alta para problema grave de atendimento ou cobrança. Reclamação: use encaminhar_humano=true e avise que uma pessoa da equipe vai continuar por aqui.',\n  '- Elogio ou sugestão: agradeça de coração e registre; só encaminhe se o cliente pedir.',\n  '',\n  '## Delivery (segunda opção)',\n  'Somente se a unidade tiver delivery. Colete: itens do pedido, endereço, bairro, ponto de referência, forma de pagamento (e troco), nome e telefone. Resuma e peça confirmação antes de registrar_delivery. Diga que a equipe confirma valor e prazo (não prometa prazo).',\n  '',\n  '## Quando chamar uma pessoa',\n  'Use chamar_atendente quando o cliente pedir para falar com uma pessoa, quando o assunto não puder ser resolvido com as ferramentas (cardápio detalhado, eventos fechados, nota fiscal, cobrança, parcerias etc.) ou depois de duas tentativas sem entender. Explique em uma frase que alguém da equipe continua por aqui.',\n  '',\n  '## Contexto desta conversa',\n  'Agora: ' + hoje + '.',\n  'Calendário: ' + proximos.join('; ') + '.',\n  'Cliente: ' + (pre.nome && !/^\\+?\\d+$/.test(pre.nome) ? pre.nome + ' (nome no WhatsApp, pode ser apelido: confirme o nome completo para a reserva)' : 'nome ainda não informado') + '. Telefone do WhatsApp: ' + pre.phone + '.',\n  '',\n  '## Formato da resposta final',\n  'Somente o texto que será enviado ao cliente: sem markdown, sem asteriscos, sem títulos. Datas como dia/mês (ex.: sábado, 31/10) e horários como 12h30.',\n  avisos ? '\\n## Avisos da gestão e regras desta unidade\\n' + avisos : '',\n].join('\\n');\n\nconst tool = (name, description, properties, required) => ({ type: 'function', function: { name: name, description: description, parameters: { type: 'object', properties: properties, required: required || [] } } });\nconst UN = { type: 'string', description: 'Código da unidade: goiania ou anapolis' };\nconst tools = [\n  tool('consultar_valores', 'Valores vigentes da unidade na data (por dia da semana, feriado e tabela do mês) e política infantil. Use sempre antes de falar de preço.', { unidade: UN, data: { type: 'string', description: 'Data AAAA-MM-DD; omita para hoje' } }, ['unidade']),\n  tool('consultar_disponibilidade', 'Horários com vaga para reservar numa data, ou dias com vaga num intervalo (informe data e data_fim).', { unidade: UN, data: { type: 'string', description: 'AAAA-MM-DD' }, data_fim: { type: 'string', description: 'AAAA-MM-DD, só para listar dias com vaga' }, pessoas: { type: 'integer' } }, ['unidade', 'data', 'pessoas']),\n  tool('criar_reserva', 'Cria a reserva. Só chame depois de o cliente confirmar o resumo.', {\n    unidade: UN, data: { type: 'string', description: 'AAAA-MM-DD' }, horario: { type: 'string', description: 'HH:MM' }, pessoas: { type: 'integer' },\n    nome_completo: { type: 'string', description: 'Nome e sobrenome' }, telefone: { type: 'string', description: 'Só se o cliente pedir outro número; senão omita (usa o WhatsApp da conversa)' },\n    servico: { type: 'string', enum: ['rodizio_carnes', 'rodizio_pizza', 'almoco_quilo', 'almoco_executivo'] },\n    ocasiao: { type: 'string', enum: ['aniversario', 'romantico', 'comemoracao', 'negocios', 'familia', 'nenhuma'] },\n    nome_aniversariante: { type: 'string' }, observacoes: { type: 'string', description: 'Pedidos especiais, crianças, cadeirão, bolo...' },\n  }, ['unidade', 'data', 'horario', 'pessoas', 'nome_completo']),\n  tool('consultar_reservas', 'Reservas recentes do telefone do cliente.', { telefone: { type: 'string' } }),\n  tool('alterar_reserva', 'Altera data, horário ou quantidade de pessoas de uma reserva.', { protocolo: { type: 'string' }, data: { type: 'string' }, horario: { type: 'string' }, pessoas: { type: 'integer' } }, ['protocolo']),\n  tool('cancelar_reserva', 'Cancela uma reserva (peça confirmação antes).', { protocolo: { type: 'string' }, motivo: { type: 'string' } }, ['protocolo']),\n  tool('registrar_atendimento', 'Registra reclamação, elogio, sugestão ou problema no sistema (SAC).', {\n    categoria: { type: 'string', enum: ['reclamacao', 'elogio', 'sugestao', 'duvida', 'problema_reserva', 'atendimento', 'outros'] },\n    assunto: { type: 'string', description: 'Resumo curto' }, descricao: { type: 'string', description: 'O que aconteceu, quando e onde' },\n    prioridade: { type: 'string', enum: ['baixa', 'media', 'alta', 'urgente'] }, unidade: UN, nome_completo: { type: 'string' },\n    encaminhar_humano: { type: 'boolean', description: 'true para reclamações e quando o cliente quer falar com uma pessoa' },\n  }, ['categoria', 'assunto', 'descricao', 'prioridade', 'encaminhar_humano']),\n  tool('chamar_atendente', 'Encaminha a conversa para uma pessoa da equipe e pausa o atendente virtual.', { motivo: { type: 'string' }, unidade: UN }, ['motivo']),\n  tool('registrar_delivery', 'Registra pedido de delivery (só unidades com delivery). Só chame depois de o cliente confirmar o resumo.', {\n    unidade: UN, itens: { type: 'string' }, endereco: { type: 'string' }, bairro: { type: 'string' }, referencia: { type: 'string' },\n    pagamento: { type: 'string', enum: ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro'] }, troco_para: { type: 'number' },\n    nome_completo: { type: 'string' }, telefone: { type: 'string' }, observacoes: { type: 'string' },\n  }, ['unidade', 'itens', 'endereco', 'nome_completo']),\n  tool('definir_cidade', 'Registra onde o cliente mora e onde quer comer. Marca a conversa (a marcação da cidade só vale para quem mora na cidade E quer comer nela) e, se ele quiser comer na outra unidade, devolve o WhatsApp dela para você enviar.', {\n    mora_em: { type: 'string', enum: ['goiania', 'anapolis', 'outra', 'nao_informado'], description: 'Cidade onde o cliente mora' },\n    quer_comer_em: { type: 'string', enum: ['goiania', 'anapolis'], description: 'Unidade onde o cliente pretende comer' },\n  }, ['quer_comer_em']),\n  tool('consultar_delivery', 'Pedidos de delivery recentes do cliente.', { protocolo: { type: 'string' } }),\n];\n\nconst historico = (an.historico || []).map((m) => ({ role: m.role, content: m.content }));\nif (audioTexto) {\n  const marca = '[áudio do cliente, transcrito]: ' + audioTexto;\n  const ult = historico[historico.length - 1];\n  if (ult && ult.role === 'user') ult.content = /^\\[o cliente enviou [^\\]]*áudio[^\\]]*\\]$/.test(ult.content) ? marca : ult.content.replace(/\\[o cliente enviou [^\\]]*áudio[^\\]]*\\]/, marca);\n  else historico.push({ role: 'user', content: marca });\n}\nif (!historico.length || historico[historico.length - 1].role !== 'user') historico.push({ role: 'user', content: '(sem texto)' });\n\nconst modelo = cfg.modelo || 'gpt-4.1';\nconst req = { model: modelo, messages: [{ role: 'system', content: prompt }].concat(historico), tools: tools, tool_choice: 'auto', max_completion_tokens: 700 };\nif (/^gpt-4/.test(modelo)) req.temperature = 0.3;\n\nreturn [{ json: {\n  req: req,\n  ctx: { phone: pre.phone, nome: pre.nome, conv_id: pre.conv_id, msg_id: an.ultima_msg_id || pre.msg_id, contact_id: pre.contact_id,\n    unidades: lista.map((u) => ({ id: u.id, slug: u.slug, nome: u.name, cidade: u.city || '' })), unidade_slug: mapeada ? mapeada.slug : null, cidades: cidades },\n  api: api, rodada: 0, final: false, falha: '', texto: '',\n  efeitos: { labels_add: [], labels_remove: [], tags: [], redirect: null, notas: [], handoff: false, handoff_motivo: '', ultima_reserva: null, sac: null, usadas: [], classificacao: '', protocolos: {} },\n  ctx_ok: lista.length > 0,\n} }];\n" } },
  output: [{ req: { model: 'gpt-4.1', messages: [] }, ctx: {}, api: {}, rodada: 0, final: false, efeitos: {} }],
});
const rodada1 = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: { name: 'Rodada 1', onError: 'continueErrorOutput', parameters: { mode: 'each', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'Nf24mfJmZ5VruTd1' } } },
  output: [{ final: true, falha: '', texto: 'Oi!', rodada: 1, efeitos: {}, req: {} }],
});
const rodada2 = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: { name: 'Rodada 2', onError: 'continueErrorOutput', parameters: { mode: 'each', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'Nf24mfJmZ5VruTd1' } } },
  output: [{ final: true, falha: '', texto: 'Oi!', rodada: 2, efeitos: {}, req: {} }],
});
const rodada3 = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: { name: 'Rodada 3', onError: 'continueErrorOutput', parameters: { mode: 'each', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'Nf24mfJmZ5VruTd1' } } },
  output: [{ final: true, falha: '', texto: 'Oi!', rodada: 3, efeitos: {}, req: {} }],
});
const rodada4 = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: { name: 'Rodada 4', onError: 'continueErrorOutput', parameters: { mode: 'each', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'Nf24mfJmZ5VruTd1' } } },
  output: [{ final: true, falha: '', texto: 'Oi!', rodada: 4, efeitos: {}, req: {} }],
});
const fim1 = ifElse({
  version: 2.2,
  config: {
    name: 'Terminou 1?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.final }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
const fim2 = ifElse({
  version: 2.2,
  config: {
    name: 'Terminou 2?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.final }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
const fim3 = ifElse({
  version: 2.2,
  config: {
    name: 'Terminou 3?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.final }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
    },
  },
});
const finalizar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Finalizar', parameters: { mode: 'runOnceForAllItems', jsCode: "// Finalizar: valida a resposta, divide em mensagens de WhatsApp e registra a classificacao no sistema\nconst helpers = this.helpers;\n// datas relativas: corrige hoje/amanhã/ontem frente a uma data dd/mm citada junto, tendo como referência o momento refMs\nconst pad2 = (n) => String(n).padStart(2, '0');\nconst spDate = (ms) => new Date(ms - 3 * 3600 * 1000);\nconst dmStr = (d) => pad2(d.getUTCDate()) + '/' + pad2(d.getUTCMonth() + 1);\nconst DIAS_SEM = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];\nconst corrigirRel = (txt, refMs) => {\n  const base = spDate(refMs);\n  const h = dmStr(base), a = dmStr(new Date(base.getTime() + 86400000)), o = dmStr(new Date(base.getTime() - 86400000));\n  return String(txt).replace(/\\b(hoje|amanh[ãa]|ontem)(\\s*[,(]?\\s*(?:[a-zçãé]+-feira,?\\s*)?\\(?)(\\d{1,2})\\/(\\d{1,2})/gi, (m, rel, sep, d, mo) => {\n    const k = pad2(d) + '/' + pad2(mo);\n    const novo = k === h ? 'hoje' : k === a ? 'amanhã' : k === o ? 'ontem' : null;\n    if (!novo) return m;\n    const cap = rel.charAt(0) === rel.charAt(0).toUpperCase() ? novo.charAt(0).toUpperCase() + novo.slice(1) : novo;\n    return cap + sep + d + '/' + mo;\n  });\n};\nconst st = $input.first().json;\nconst pre = $('Prefiltro').first().json;\nconst cfg = pre.cfg || {};\nconst ef = st.efeitos || { labels_add: [], labels_remove: [], notas: [], handoff: false, handoff_motivo: '', usadas: [], protocolos: {} };\nlet texto = String(st.texto || '').replace(/\\*\\*/g, '').replace(/^#+\\s*/gm, '').replace(/^\\s*[-*]\\s+/gm, '- ').trim();\ntexto = corrigirRel(texto.replace(/\\[de [^\\]]*\\]\\s*/g, ''), Date.now());\nlet guard = '';\nconst falhou = !!st.falha || !texto;\n\nif (falhou) {\n  texto = 'Desculpe, tive um probleminha aqui para responder agora. Vou pedir para alguém da nossa equipe continuar o seu atendimento por aqui, tudo bem?';\n  guard = 'falha:' + (st.falha || 'resposta_vazia');\n  ef.handoff = true;\n  ef.handoff_motivo = ef.handoff_motivo || 'Falha do atendente virtual (' + (st.falha || 'resposta vazia') + ')';\n  if (ef.labels_add.indexOf('atendimento-humano') < 0) ef.labels_add.push('atendimento-humano');\n  ef.notas.push('[Atendente IA] Não consegui responder (' + (st.falha || 'resposta vazia') + (st.falha_detalhe ? ': ' + st.falha_detalhe : '') + '). Conversa encaminhada para a equipe.');\n} else {\n  const negada = /\\bn[aã]o\\s+(est[aá]|foi|ficou)\\s+confirmad/gi;\n  const afirma = /\\b(est[aá]|foi|ficou)\\s+confirmad[ao]\\b|\\breserva\\s+confirmada\\b|\\bconfirmamos\\s+(a\\s+)?sua\\s+reserva/i;\n  if (ef.ultima_reserva && ef.ultima_reserva.status === 'pendente' && afirma.test(texto.replace(negada, ''))) {\n    texto = ef.ultima_reserva.mensagem || texto;\n    guard = 'confirmacao_indevida';\n  }\n  const promessa = /\\b(em at[eé]\\s+\\d+|dentro de\\s+\\d+|em\\s+\\d+\\s*(h|hs|horas?|min|minutos?|dias?)\\b|at[eé] amanh[aã]|hoje mesmo|prazo|garantimos|vamos resolver|resolveremos|ser[aá] resolvid|reembols|compensaremos|devolveremos)/i;\n  if ((ef.sac || ef.handoff) && promessa.test(texto)) {\n    texto = (ef.sac && ef.sac.mensagem) || 'Certo, vou encaminhar a sua conversa para uma pessoa da nossa equipe, que vai continuar o atendimento por aqui.';\n    guard = guard ? guard + '+promessa' : 'promessa_indevida';\n  }\n}\n\n// quem escreveu no numero da outra unidade sempre recebe o link do WhatsApp certo\nif (!falhou && ef.redirect && ef.redirect.link && texto.indexOf('wa.me') < 0) {\n  texto = texto + '\\n\\nFale com a equipe de ' + ef.redirect.nome + ' por aqui:\\n' + ef.redirect.link;\n  guard = guard ? guard + '+link_cidade' : 'link_cidade';\n}\nlet blocos = texto.split(/\\n{2,}/).map((s) => s.trim()).filter(Boolean);\nif (blocos.length > 3) blocos = blocos.slice(0, 2).concat([blocos.slice(2).join('\\n')]);\nconst bolhas = [];\nblocos.forEach((b) => {\n  let resto = b;\n  while (resto.length > 900) {\n    let corte = resto.lastIndexOf('. ', 900);\n    if (corte < 300) corte = resto.lastIndexOf(' ', 900);\n    if (corte < 1) corte = 900;\n    bolhas.push(resto.slice(0, corte + 1).trim());\n    resto = resto.slice(corte + 1).trim();\n  }\n  if (resto) bolhas.push(resto);\n});\n\nlet classe = ef.classificacao || '';\nif (!classe) classe = (ef.usadas || []).some((u) => /^consultar_disponibilidade/.test(u)) ? 'interesse_reserva' : 'duvida_geral';\nconst classificacao = { ok: false };\ntry {\n  const body = {\n    external_id: String(pre.conv_id), classification: falhou || ef.handoff ? (ef.classificacao || 'atendimento_humano') : classe,\n    intent: (ef.usadas || []).slice(0, 6).join(',').slice(0, 120) || null, tags: ['whatsapp', 'atendente-ia'].concat(ef.tags || []),\n    summary: ('Cliente: ' + String((st.req && st.req.messages && st.req.messages.length ? (st.req.messages.filter((m) => m.role === 'user').slice(-1)[0] || {}).content : '') || '').slice(0, 220)),\n    reservation_protocol: (ef.protocolos || {}).reserva || null, sac_protocol: (ef.protocolos || {}).sac || null,\n    phone: pre.phone, contact_name: pre.nome && !/^\\+?\\d+$/.test(pre.nome) ? pre.nome : null, contact_external_id: pre.contact_id ? String(pre.contact_id) : null, channel: 'whatsapp',\n  };\n  const r = await helpers.httpRequest({ method: 'POST', url: String(cfg.api_base || '').replace(/\\/+$/, '') + '/conversations/classify', headers: { Authorization: 'Bearer ' + cfg.api_key }, body: body, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 20000 });\n  classificacao.ok = r.statusCode === 200;\n  classificacao.status = r.statusCode;\n} catch (e) { classificacao.erro = String(e.message || e).slice(0, 120); }\n\nreturn [{ json: {\n  bolhas: bolhas, texto_final: texto, efeitos: ef, falhou: falhou, guard: guard, classificacao: classificacao,\n  conv_id: pre.conv_id, bot_id: Number(cfg.bot_id || 0) || null, ferramentas: ef.usadas || [], rodadas: st.rodada || 0,\n} }];\n" } },
  output: [{ bolhas: ['Oi!'], texto_final: 'Oi!', efeitos: { handoff: false }, falhou: false, guard: '', classificacao: {}, conv_id: 1, bot_id: 12, ferramentas: [], rodadas: 1 }],
});
const bolhas = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Separar mensagens', parameters: { mode: 'runOnceForAllItems', jsCode: "// Um item por mensagem de WhatsApp a enviar\nconst f = $input.first().json;\nreturn (f.bolhas || []).map((t) => ({ json: { conv_id: f.conv_id, texto: t, bot_id: f.bot_id } }));\n" } },
  output: [{ conv_id: 1, texto: 'Oi!', bot_id: 12 }],
});
const enviar = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: 'Enviar mensagem',
    parameters: {
      method: 'POST',
      url: expr('{{ $("Prefiltro").first().json.cfg.crm_base }}/api/v1/accounts/{{ $("Prefiltro").first().json.cfg.crm_conta }}/conversations/{{ $json.conv_id }}/messages'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify(Object.assign({ content: $json.texto, message_type: "outgoing", private: false, content_attributes: { sdr: true } }, $json.bot_id ? { sender_type: "AgentBot", sender_id: $json.bot_id } : {})) }}'),
      options: { timeout: 20000, batching: { batch: { batchSize: 1, batchInterval: 1600 } }, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200 }],
});

const lerEtiquetas = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: 'Ler etiquetas',
    parameters: {
      method: 'GET',
      url: expr('{{ $("Prefiltro").first().json.cfg.crm_base }}/api/v1/accounts/{{ $("Prefiltro").first().json.cfg.crm_conta }}/conversations/{{ $("Prefiltro").first().json.conv_id }}/labels'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200, body: { payload: [] } }],
});

const montarAcoes = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Montar acoes no CRM', parameters: { mode: 'runOnceForAllItems', jsCode: "// Montar acoes: etiquetas, notas privadas e abertura da conversa no CRM\nconst fin = $('Finalizar').first().json;\nconst pre = $('Prefiltro').first().json;\nconst cfg = pre.cfg || {};\nconst ef = fin.efeitos || {};\nconst base = String(cfg.crm_base || '').replace(/\\/+$/, '') + '/api/v1/accounts/' + cfg.crm_conta + '/conversations/' + pre.conv_id;\nconst r = $input.first().json || {};\nconst corpo = r.body || r;\nconst atuais = Array.isArray(corpo.payload) ? corpo.payload : Array.isArray(corpo) ? corpo : [];\nconst set = new Set(atuais);\n(ef.labels_remove || []).forEach((l) => set.delete(l));\n(ef.labels_add || []).forEach((l) => set.add(l));\nconst novas = Array.from(set).sort();\nconst bot = Number(cfg.bot_id || 0) || null;\nconst acoes = [];\nif (novas.join('|') !== atuais.slice().sort().join('|')) acoes.push({ metodo: 'POST', url: base + '/labels', corpo: { labels: novas } });\nconst notas = (ef.notas || []).slice();\nif (ef.handoff && !notas.some((n) => /encaminhad/i.test(n))) notas.push('[Atendente IA] Atendimento encaminhado para a equipe. Motivo: ' + (ef.handoff_motivo || 'não informado'));\nnotas.forEach((n) => {\n  const c = { content: n, message_type: 'outgoing', private: true };\n  if (bot) { c.sender_type = 'AgentBot'; c.sender_id = bot; }\n  c.content_attributes = { sdr: true };\n  acoes.push({ metodo: 'POST', url: base + '/messages', corpo: c });\n});\nif (ef.handoff) acoes.push({ metodo: 'POST', url: base + '/toggle_status', corpo: { status: 'open' } });\nreturn acoes.map((a) => ({ json: a }));\n" } },
  output: [{ metodo: 'POST', url: 'https://app.tryadecrm.com/api/v1/accounts/15/conversations/1/labels', corpo: { labels: [] } }],
});
const executarAcoes = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: 'Executar acoes no CRM',
    parameters: {
      method: expr('{{ $json.metodo }}'),
      url: expr('{{ $json.url }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.corpo) }}'),
      options: { timeout: 20000, batching: { batch: { batchSize: 1, batchInterval: 400 } }, response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: { id: 'U0xKKChzwoDyf1N8', name: 'Header Auth account 5' } },
  },
  output: [{ statusCode: 200 }],
});

const pausaBot = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Pausar bot se encaminhou', parameters: { mode: 'runOnceForAllItems', jsCode: "// Se a conversa foi encaminhada para a equipe, o bot fica quieto nela\n// Falha tecnica da IA (sem creditos, instabilidade) pausa pouco: quando voltar, o bot ja atende de novo\nconst fin = $('Finalizar').first().json;\nconst pre = $('Prefiltro').first().json;\nif (!fin.efeitos || !fin.efeitos.handoff) return [];\nconst agora = new Date();\nconst falha = !!fin.falhou;\nconst ms = falha ? Number(pre.cfg.pausa_falha_min || 30) * 60 * 1000 : Number(pre.cfg.pausa_handoff_h || 24) * 3600 * 1000;\nreturn [{ json: { conv_id: String(pre.conv_id), telefone: pre.phone, pausado_ate: new Date(agora.getTime() + ms).toISOString(), motivo: falha ? 'falha_ia' : 'encaminhado_equipe', atualizado_em: agora.toISOString() } }];" } },
  output: [{ conv_id: '1', telefone: '5562993275525', pausado_ate: '2026-10-28T00:00:00.000Z', motivo: 'encaminhado_equipe', atualizado_em: '2026-10-27T00:00:00.000Z' }],
});
const gravarPausa = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Gravar pausa do bot',
    parameters: {
      resource: 'row', operation: 'upsert', dataTableId: { __rl: true, mode: 'id', value: 'N7VrcaSRz8VyFuYp' }, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'conv_id', condition: 'eq', keyValue: expr('{{ $json.conv_id }}') }] },
      columns: { mappingMode: 'defineBelow', value: { conv_id: expr('{{ $json.conv_id }}'), telefone: expr('{{ $json.telefone }}'), pausado_ate: expr('{{ $json.pausado_ate }}'), motivo: expr('{{ $json.motivo }}'), atualizado_em: expr('{{ $json.atualizado_em }}') }, schema: [{ id: 'conv_id', displayName: 'conv_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'telefone', displayName: 'telefone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'pausado_ate', displayName: 'pausado_ate', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'motivo', displayName: 'motivo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'atualizado_em', displayName: 'atualizado_em', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }] },
    },
  },
  output: [{ id: 1 }],
});

const prepararLog = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar registro', parameters: { mode: 'runOnceForAllItems', jsCode: "// Linha do registro de atendimento (tabela candeeiro_log)\nconst fin = $('Finalizar').first().json;\nconst pre = $('Prefiltro').first().json;\nreturn [{ json: { quando: new Date().toISOString(), conv_id: String(pre.conv_id), telefone: pre.phone, tipo: fin.falhou ? 'falha' : 'resposta', msg_id: String(pre.msg_id || ''),\n  detalhe: JSON.stringify({ ferramentas: fin.ferramentas, rodadas: fin.rodadas, guard: fin.guard, handoff: !!(fin.efeitos && fin.efeitos.handoff), classificacao: fin.classificacao, resposta: String(fin.texto_final || '').slice(0, 400) }).slice(0, 1800) } }];\n" } },
  output: [{ quando: '2026-10-27T00:00:00.000Z', conv_id: '1', telefone: '5562993275525', tipo: 'resposta', msg_id: '1', detalhe: '{}' }],
});
const registrarLog = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Registrar atendimento',
    parameters: {
      resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'id', value: 'QWR9jOdQ9KxGCoFM' },
      columns: { mappingMode: 'defineBelow', value: { quando: expr('{{ $json.quando }}'), conv_id: expr('{{ $json.conv_id }}'), telefone: expr('{{ $json.telefone }}'), tipo: expr('{{ $json.tipo }}'), msg_id: expr('{{ $json.msg_id }}'), detalhe: expr('{{ $json.detalhe }}') }, schema: [{ id: 'quando', displayName: 'quando', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'conv_id', displayName: 'conv_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'telefone', displayName: 'telefone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'tipo', displayName: 'tipo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'msg_id', displayName: 'msg_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'detalhe', displayName: 'detalhe', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }] },
    },
  },
  output: [{ id: 1 }],
});

export default workflow('candeeiro-atendente-sdr', 'Candeeiro - Atendente SDR (WhatsApp)')
  .add(webhook)
  .to(lerConfig)
  .to(prefiltro)
  .to(passaPre
    .onTrue(ehCliente
      .onTrue(lerEstado
        .to(portao)
        .to(responder.onTrue(debounce
          .to(lerMensagens)
          .to(analisar)
          .to(seguir.onTrue(temAudio
            .onTrue(separarAudios.to(baixarAudio).to(nomearAudio).to(transcrever).to(juntarTranscricoes).to(montarPrompt))
            .onFalse(montarPrompt))))))
      .onFalse(calcPausa.to(gravarPausaHumano))))
  .add(montarPrompt)
  .to(rodada1.onError(finalizar))
  .to(fim1
    .onTrue(finalizar)
    .onFalse(rodada2.onError(finalizar).to(fim2
      .onTrue(finalizar)
      .onFalse(rodada3.onError(finalizar).to(fim3
        .onTrue(finalizar)
        .onFalse(rodada4.onError(finalizar).to(finalizar)))))))
  .add(finalizar)
  .to(bolhas.to(enviar))
  .add(finalizar)
  .to(lerEtiquetas.to(montarAcoes).to(executarAcoes))
  .add(finalizar)
  .to(pausaBot.to(gravarPausa))
  .add(finalizar)
  .to(prepararLog.to(registrarLog))
  .group('1. Receber e filtrar', [lerConfig, prefiltro, passaPre, ehCliente], { description: 'Lê a config, ignora o que não é do atendente (modo teste, caixa, grupo, bot) e separa cliente de resposta humana.' })
  .group('Pessoa respondeu: pausar bot', [calcPausa, gravarPausaHumano], { description: 'Quando uma pessoa responde (painel ou celular), o bot fica quieto por 12 h.' })
  .group('2. Pausa, espera e leitura da conversa', [lerEstado, portao, responder, debounce, lerMensagens, analisar, seguir], { description: 'Confere a pausa, espera 8 s para juntar mensagens e lê o histórico.' })
  .group('3. Áudio do cliente', [separarAudios, baixarAudio, nomearAudio, transcrever, juntarTranscricoes], { description: 'Baixa e transcreve os áudios do cliente.' })
  .group('4. IA + ferramentas', [montarPrompt, rodada1, fim1, rodada2, fim2, rodada3, fim3, rodada4, finalizar], { description: 'Monta as regras, roda até 4 rodadas de OpenAI + ferramentas e valida a resposta.' })
  .group('5. Responder ao cliente', [bolhas, enviar], { description: 'Envia a resposta em até 3 mensagens pelo CRM, como bot.' })
  .group('6. Etiquetas, notas e status no CRM', [lerEtiquetas, montarAcoes, executarAcoes], { description: 'Atualiza etiquetas, grava notas privadas e abre a conversa se foi encaminhada.' })
  .group('7. Pausa após encaminhar', [pausaBot, gravarPausa], { description: 'Se a conversa foi para a equipe, o bot fica quieto nela por 24 h.' })
  .group('8. Registro do atendimento', [prepararLog, registrarLog], { description: 'Uma linha por resposta na tabela candeeiro_log.' });
