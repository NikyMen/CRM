// Genera el workflow de n8n "ROMEZ - Asistente comercial WhatsApp" a partir de los archivos de ./code
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const code = (f) => fs.readFileSync(path.join(__dirname, 'code', f), 'utf8').trimEnd()
const uid = () => crypto.randomUUID()

const nodes = []
const conns = {}
const add = (node) => { node.id = uid(); nodes.push(node); return node }
const link = (from, to, out = 0, type = 'main') => {
  conns[from] ??= {}
  conns[from][type] ??= []
  while (conns[from][type].length <= out) conns[from][type].push([])
  conns[from][type][out].push({ node: to, type, index: 0 })
}

// ---------- helpers de nodos ----------
const codeNode = (name, file, pos, extra = {}) =>
  add({ parameters: { jsCode: code(file) }, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, name, ...extra })

const ifNode = (name, left, pos, { op = 'boolTrue', right = '' } = {}) => {
  const operator = op === 'boolTrue'
    ? { type: 'boolean', operation: 'true', singleValue: true }
    : { type: 'string', operation: 'equals' }
  return add({
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
        conditions: [{ id: uid(), leftValue: left, rightValue: op === 'boolTrue' ? true : right, operator }],
        combinator: 'and',
      },
      options: {},
    },
    type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos, name,
  })
}

const BEARER = { authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth' }
const wppiaCred = { httpBearerAuth: { name: 'Bearer Auth WppIA' } }
const WPPIA = "={{ $('Config').first().json.wppiaUrl }}"

const SQL = require('./sql.js')
const pgCred = { postgres: { name: 'Postgres ROMEZ' } }
const pgNode = (name, query, params, pos, { read = false } = {}) => add({
  parameters: {
    operation: 'executeQuery',
    query,
    options: params ? { queryReplacement: '={{ [' + params.join(', ') + '] }}' } : {},
  },
  type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: pos, name, credentials: pgCred,
  ...(read ? { alwaysOutputData: true } : {}),
})
const pgGet = (name, phoneExpr, pos) => pgNode(name, SQL.GET_ONE, [phoneExpr], pos, { read: true })
const pgGetAll = (name, pos) => pgNode(name, SQL.GET_ALL, null, pos, { read: true })
const pgSaveEstado = (name, pos) => pgNode(name, SQL.UPSERT_ESTADO, ['$json.phone', '$json.estado'], pos)

const sticky = (content, pos, w, h, color = 4) =>
  add({ parameters: { content, height: h, width: w, color }, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos, name: 'Nota ' + (nodes.length + 1) })

// ---------- disparadores y configuración ----------
const wh = add({
  parameters: { httpMethod: 'POST', path: 'romez-comercial', options: {} },
  type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [0, 200], name: 'Webhook wppia', webhookId: uid(),
})
const sch = add({
  parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } },
  type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 780], name: 'Cada hora (seguimientos)',
})

const cfgField = (name, value, type = 'string') => ({ id: uid(), name, value, type })
const cfg = add({
  parameters: {
    assignments: {
      assignments: [
        cfgField('wppiaUrl', 'https://wppia.consultoriadigital.io'),
        cfgField('webhookSecret', 'CAMBIAR'),
        cfgField('botActivo', true, 'boolean'),
        cfgField('soloPrueba', ''),
        cfgField('excluir', ''),
        cfgField('notificarA', ''),
        cfgField('pausaHoras', 8, 'number'),
        cfgField('esperaSegundos', 6, 'number'),
        cfgField('maxAudioSegundos', 150, 'number'),
        cfgField('atencionDesde', '08:00'),
        cfgField('atencionHasta', '18:00'),
        cfgField('atencionDias', '1,2,3,4,5'),
        cfgField('seguimientoActivo', false, 'boolean'),
        cfgField('seguimientoHoras', 22, 'number'),
        cfgField('seguimientoDesde', '08:30'),
        cfgField('seguimientoHasta', '18:00'),
        cfgField('crmActivo', false, 'boolean'),
        cfgField('crmUrl', 'https://romez.consultoriadigital.io/api/v1'),
      ],
    },
    includeOtherFields: true,
    options: {},
  },
  type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [300, 480], name: 'Config',
  notes: 'PANEL DE CONTROL. Todo lo que se cambia a mano está acá. Empezá con soloPrueba = tu número de prueba.',
  notesInFlow: true,
})
link(wh.name, cfg.name)
link(sch.name, cfg.name)

const norm = codeNode('Normalizar mensaje', 'normalizar.js', [560, 480])
link(cfg.name, norm.name)

// ---------- enrutamiento ----------
const ifIn = ifNode('¿Mensaje entrante?', "={{ $json.route === 'inbound' }}", [820, 360])
const ifMe = ifNode('¿Lo escribió una persona?', "={{ $json.route === 'fromMe' }}", [820, 560])
const ifScan = ifNode('¿Es el disparo horario?', "={{ $json.route === 'scan' }}", [820, 760])
link(norm.name, ifIn.name)
link(ifIn.name, ifMe.name, 1)
link(ifMe.name, ifScan.name, 1)

// ---------- toma humana ----------
const leerMe = pgGet('Leer estado (toma humana)', '$json.phone', [1080, 560])
const toma = codeNode('Toma humana', 'toma-humana.js', [1320, 560])
const ifGuardarMe = ifNode('¿Pausar al bot?', '={{ $json.guardar }}', [1560, 560])
const guardarMe = pgSaveEstado('Guardar pausa', [1800, 540])
link(ifMe.name, leerMe.name, 0)
link(leerMe.name, toma.name)
link(toma.name, ifGuardarMe.name)
link(ifGuardarMe.name, guardarMe.name, 0)

// ---------- mensaje entrante ----------
const leerIn = pgGet('Leer estado (entrante)', '$json.phone', [1080, 240])
const estado = codeNode('Estado del chat', 'estado-chat.js', [1320, 240])
const ifResp = ifNode('¿Responde el bot?', '={{ $json.responder }}', [1560, 240])
link(ifIn.name, leerIn.name, 0)
link(leerIn.name, estado.name)
link(estado.name, ifResp.name)

const ifAudio = ifNode('¿Es un audio?', "={{ $json.kind === 'audio' }}", [1800, 240])
const ifCorto = ifNode('¿Audio corto?', "={{ $json.seconds <= $('Config').first().json.maxAudioSegundos }}", [2040, 120])
link(ifResp.name, ifAudio.name, 0)
link(ifAudio.name, ifCorto.name, 0)

const decrypt = add({
  parameters: {
    method: 'POST', url: "={{ $('Config').first().json.wppiaUrl }}/api/decrypt-media",
    ...BEARER, sendBody: true, specifyBody: 'json',
    jsonBody: "={{ ({ data: { messages: $('Estado del chat').first().json.rawForMedia } }) }}",
    options: { timeout: 20000 },
  },
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.3, position: [2280, 40], name: 'Descifrar audio (wppia)',
  credentials: wppiaCred, onError: 'continueRegularOutput',
})
const bajar = add({
  parameters: {
    url: '={{ $json.publicUrl }}',
    options: { timeout: 30000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
  },
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.3, position: [2520, 40], name: 'Bajar audio',
  onError: 'continueRegularOutput',
})
const whisper = add({
  parameters: {
    method: 'POST', url: 'https://api.openai.com/v1/audio/transcriptions',
    authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi',
    sendBody: true, contentType: 'multipart-form-data',
    bodyParameters: {
      parameters: [
        { parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'data' },
        { name: 'model', value: 'whisper-1' },
        { name: 'language', value: 'es' },
      ],
    },
    options: { timeout: 60000 },
  },
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.3, position: [2760, 40], name: 'Transcribir audio',
  credentials: { openAiApi: { name: 'OpenAI ROMEZ' } }, onError: 'continueRegularOutput',
})
const largo = add({
  parameters: { assignments: { assignments: [cfgField('audioLargo', true, 'boolean')] }, includeOtherFields: true, options: {} },
  type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [2280, 220], name: 'Audio largo',
})
link(ifCorto.name, decrypt.name, 0)
link(decrypt.name, bajar.name)
link(bajar.name, whisper.name)
link(ifCorto.name, largo.name, 1)

const textoFinal = codeNode('Texto final', 'texto-final.js', [3000, 240])
link(whisper.name, textoFinal.name)
link(largo.name, textoFinal.name)
link(ifAudio.name, textoFinal.name, 1)

// buffer anti-ráfaga
const guardarBuf = pgNode('Guardar mensaje (buffer)', SQL.UPSERT_BUFFER, ['$json.phone', '$json.estado', '$json.lastMsgId', '$json.buffer'], [3240, 240])
const espera = add({
  parameters: { resume: 'timeInterval', amount: "={{ $('Config').first().json.esperaSegundos }}", unit: 'seconds' },
  type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [3480, 240], name: 'Esperar ráfaga', webhookId: uid(),
})
const leerPost = pgNode('Leer estado (post espera)', SQL.CONSUMIR_BUFFER, ["$('Texto final').first().json.phone", "$('Texto final').first().json.messageId"], [3720, 240], { read: true })
const ultimo = codeNode('¿Último mensaje?', 'ultimo-mensaje.js', [3960, 240])
const ifUlt = ifNode('¿Sigo yo?', '={{ $json.continuar }}', [4200, 240])
link(textoFinal.name, guardarBuf.name)
link(guardarBuf.name, espera.name)
link(espera.name, leerPost.name)
link(leerPost.name, ultimo.name)
link(ultimo.name, ifUlt.name)

// ---------- IA ----------
const ficha = codeNode('Ficha de servicios', 'ficha.js', [4440, 240])
const ctx = codeNode('Armar contexto IA', 'armar-contexto.js', [4680, 240])
const agent = add({
  parameters: { promptType: 'define', text: '={{ $json.aiInput }}', options: { systemMessage: code('prompt.txt') } },
  type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 3.1, position: [4920, 240], name: 'AI Agent', onError: 'continueRegularOutput',
})
const llm = add({
  parameters: { model: { __rl: true, mode: 'list', value: 'gpt-4.1-mini' }, builtInTools: {}, options: { temperature: 0.3 } },
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.3, position: [4880, 480], name: 'OpenAI Chat Model',
  credentials: { openAiApi: { name: 'OpenAI ROMEZ' } },
})
const mem = add({
  parameters: { sessionIdType: 'customKey', sessionKey: "={{ 'romez:' + $json.phone }}", contextWindowLength: 6 },
  type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', typeVersion: 1.3, position: [5120, 480], name: 'Memoria del chat',
})
link(ifUlt.name, ficha.name, 0)
link(ficha.name, ctx.name)
link(ctx.name, agent.name)
link(llm.name, agent.name, 0, 'ai_languageModel')
link(mem.name, agent.name, 0, 'ai_memory')

const parsear = codeNode('Parsear respuesta IA', 'parsear.js', [5200, 240])
link(agent.name, parsear.name)

// ---------- salidas ----------
const split = add({
  parameters: { fieldToSplitOut: 'mensajes', options: {} },
  type: 'n8n-nodes-base.splitOut', typeVersion: 1, position: [5460, 100], name: 'Un item por mensaje',
})
const enviar = add({
  parameters: {
    method: 'POST', url: "={{ $('Config').first().json.wppiaUrl }}/api/send-message",
    ...BEARER, sendBody: true, specifyBody: 'json',
    jsonBody: '={{ ({ to: $json.to, text: $json.text }) }}',
    options: { timeout: 15000, batching: { batch: { batchSize: 1, batchInterval: 1500 } } },
  },
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.3, position: [5700, 100], name: 'Enviar WhatsApp (wppia)',
  credentials: wppiaCred, onError: 'continueRegularOutput',
})
link(parsear.name, split.name)
link(split.name, enviar.name)

const guardarResp = pgSaveEstado('Guardar estado (respuesta)', [5460, 280])
link(parsear.name, guardarResp.name)

const ifAviso = ifNode('¿Avisar al equipo?', "={{ $json.handoff && !!$json.avisoTo }}", [5460, 440])
const avisar = add({
  parameters: {
    method: 'POST', url: "={{ $('Config').first().json.wppiaUrl }}/api/send-message",
    ...BEARER, sendBody: true, specifyBody: 'json',
    jsonBody: '={{ ({ to: $json.avisoTo, text: $json.aviso }) }}',
    options: { timeout: 15000 },
  },
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.3, position: [5700, 420], name: 'Avisar al equipo (WhatsApp)',
  credentials: wppiaCred, onError: 'continueRegularOutput',
})
link(parsear.name, ifAviso.name)
link(ifAviso.name, avisar.name, 0)

const ifCrm = ifNode('¿Sincronizar con CRM?', '={{ $json.crmSync }}', [5460, 600])
const crm = add({
  parameters: {
    method: 'POST', url: "={{ $('Config').first().json.crmUrl }}/inbound/contacts",
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.crm }}', options: { timeout: 10000 },
  },
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.3, position: [5700, 580], name: 'CRM: crear o actualizar contacto',
  credentials: { httpHeaderAuth: { name: 'ROMEZ CRM X-API-Key' } }, onError: 'continueRegularOutput', disabled: true,
  notes: 'DESACTIVADO a propósito. Usa POST /api/v1/inbound/contacts (existe hoy en el CRM). Activar solo contra un CRM de prueba.',
  notesInFlow: true,
})
link(parsear.name, ifCrm.name)
link(ifCrm.name, crm.name, 0)

// ---------- seguimientos ----------
const leerTodos = pgGetAll('Leer todos los chats', [1080, 760])
const segui = codeNode('Seguimientos pendientes', 'seguimientos.js', [1320, 760])
const guardarSeg = pgSaveEstado('Guardar estado (seguimiento)', [1560, 760])
const enviarSeg = add({
  parameters: {
    method: 'POST', url: "={{ $('Config').first().json.wppiaUrl }}/api/send-message",
    ...BEARER, sendBody: true, specifyBody: 'json',
    jsonBody: "={{ ({ to: $('Seguimientos pendientes').item.json.to, text: $('Seguimientos pendientes').item.json.text }) }}",
    options: { timeout: 15000, batching: { batch: { batchSize: 1, batchInterval: 4000 } } },
  },
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.3, position: [1800, 760], name: 'Enviar seguimiento (wppia)',
  credentials: wppiaCred, onError: 'continueRegularOutput',
})
link(ifScan.name, leerTodos.name, 0)
link(leerTodos.name, segui.name)
link(segui.name, guardarSeg.name)
link(guardarSeg.name, enviarSeg.name)

// ---------- notas ----------
sticky(
  '## ROMEZ · Asistente comercial de WhatsApp\n' +
  '**Antes de activar:** 1) crear la tabla en PostgreSQL con `romez_chats.sql` (una sola vez) y elegir la credencial `Postgres ROMEZ` en los 8 nodos Postgres; ' +
  '2) credenciales `Bearer Auth WppIA` (token de la sesión de wppia) y `OpenAI ROMEZ`; ' +
  '3) editar el nodo **Config** (secreto del webhook, `soloPrueba`, `notificarA`); ' +
  '4) en wppia, apuntar el webhook de la sesión a `/webhook/romez-comercial` y activar `includeFromMe` (mensajes propios) para que funcione la pausa por toma humana.',
  [-40, -260], 760, 220, 4)
sticky('### 1 · Entrada\nwppia envía cada mensaje. Se valida el secreto, se descartan grupos, difusiones, números internos y todo lo que no esté en `soloPrueba`.', [260, 330], 560, 100, 7)
sticky('### 2 · Toma humana\nSi una persona escribe desde el teléfono, el bot se calla `pausaHoras`. El eco de los envíos del bot (90 s) se ignora.', [1040, 700], 560, 90, 3)
sticky('### 3 · Audios\nwppia descifra → se baja el archivo → Whisper transcribe. Más de `maxAudioSegundos`: se pide resumen por escrito.', [2000, -40], 940, 90, 6)
sticky('### 4 · Anti-ráfaga\nEspera `esperaSegundos` y responde solo al último mensaje, con todo el texto junto. Evita 3 respuestas a 3 mensajes seguidos.', [3200, 80], 760, 90, 5)
sticky('### 5 · IA con bloques\nEl modelo NO escribe precios: elige bloques de la **Ficha de servicios**. Cualquier cifra suelta se descarta antes de enviar.', [4400, 80], 840, 90, 2)
sticky('### 6 · Derivación\nSi `needs_human`: se avisa a `notificarA`, el chat queda pausado `pausaHoras` y la persona continúa.', [5420, 380], 560, 90, 3)
sticky('### 7 · Seguimiento\nUn solo recordatorio a quien recibió el presupuesto y no respondió (apagado por defecto: `seguimientoActivo`).', [1040, 880], 760, 90, 5)

const wf = {
  name: 'ROMEZ - Asistente comercial WhatsApp',
  nodes,
  connections: conns,
  pinData: {},
  settings: { executionOrder: 'v1' },
}

// ---------- nodos a posición final: la disposición de arriba ya es la definitiva ----------
const outDir = process.argv[2] || path.join(__dirname, '..')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'romez-asistente-comercial.n8n.json'), JSON.stringify(wf, null, 2))
fs.writeFileSync(path.join(outDir, 'romez_chats.sql'), SQL.SETUP + '\n')
console.log('nodos:', nodes.length, '→', path.join(outDir, 'romez-asistente-comercial.n8n.json'))
