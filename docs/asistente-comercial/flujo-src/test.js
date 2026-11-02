const fs = require('fs')
const path = require('path')
const assert = require('assert')
const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'romez-asistente-comercial.n8n.json'), 'utf8'))
let ok = 0
const t = (name, fn) => { try { fn(); ok++; console.log('  ✔', name) } catch (e) { console.log('  ✘', name, '\n     ', e.message); process.exitCode = 1 } }

// ---------- 1. estructura ----------
console.log('Estructura')
const names = wf.nodes.map((n) => n.name)
t('nombres únicos', () => assert.strictEqual(new Set(names).size, names.length))
t('ids únicos', () => assert.strictEqual(new Set(wf.nodes.map((n) => n.id)).size, wf.nodes.length))
t('todas las conexiones apuntan a nodos existentes', () => {
  for (const [from, types] of Object.entries(wf.connections)) {
    assert.ok(names.includes(from), 'origen inexistente: ' + from)
    for (const outs of Object.values(types)) for (const o of outs) for (const c of o) assert.ok(names.includes(c.node), `${from} → ${c.node} no existe`)
  }
})
t('todo nodo (salvo notas y disparadores) recibe conexión', () => {
  const targets = new Set()
  for (const types of Object.values(wf.connections)) for (const outs of Object.values(types)) for (const o of outs) for (const c of o) targets.add(c.node)
  const sources = new Set(Object.keys(wf.connections))
  const huerfanos = wf.nodes.filter((n) => !/stickyNote|webhook|scheduleTrigger/.test(n.type) && !targets.has(n.name))
  // los sub-nodos de IA se conectan hacia el agente (son origen, no destino)
  const reales = huerfanos.filter((n) => !sources.has(n.name))
  assert.deepStrictEqual(reales.map((n) => n.name), [])
})
t('los nodos Code compilan', () => {
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    new Function('$input', '$json', '$', '$now', '$getWorkflowStaticData', `return (async () => {${n.parameters.jsCode}\n})()`)
  }
})
t('no quedan nodos Data Table: el estado vive en 8 nodos PostgreSQL', () => {
  assert.strictEqual(wf.nodes.filter((n) => /dataTable/.test(n.type)).length, 0)
  const pg = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.postgres')
  assert.strictEqual(pg.length, 8)
  for (const n of pg) { assert.strictEqual(n.parameters.operation, 'executeQuery'); assert.strictEqual(n.credentials.postgres.name, 'Postgres ROMEZ') }
})
t('las lecturas devuelven un item aunque no haya fila (alwaysOutputData)', () => {
  for (const n of wf.nodes.filter((x) => /^Leer /.test(x.name))) assert.strictEqual(n.alwaysOutputData, true, n.name)
})
t('cada consulta con parámetros $N recibe esa cantidad de valores', () => {
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.postgres')) {
    const max = Math.max(0, ...[...n.parameters.query.matchAll(/\$(\d)/g)].map((m) => Number(m[1])))
    const given = n.parameters.options.queryReplacement ? (n.parameters.options.queryReplacement.match(/\$json|\$\('/g) || []).length : 0
    assert.strictEqual(given, max, n.name)
  }
})
t('las credenciales de wppia se llaman «Bearer Auth WppIA»', () => {
  const nombres = new Set(wf.nodes.filter((n) => n.credentials?.httpBearerAuth).map((n) => n.credentials.httpBearerAuth.name))
  assert.deepStrictEqual([...nombres], ['Bearer Auth WppIA'])
})
t('el prompt no contiene {{ (evita expresiones accidentales)', () => {
  const ag = wf.nodes.find((n) => n.name === 'AI Agent')
  assert.ok(!ag.parameters.options.systemMessage.includes('{{'))
})

// ---------- 2. simulación ----------
console.log('Lógica de los nodos Code (payloads reales de wppia)')
const FIX = (process.env.WPPIA_FIXTURES || 'D:/dev/wppia/test/fixtures/wasender/webhook') + '/'
const fx = (f) => JSON.parse(fs.readFileSync(FIX + f, 'utf8')).body
const codeOf = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode

const stubNow = (iso) => {
  const d = new Date(iso)
  const parts = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Asuncion', hourCycle: 'h23', ...opts }).format(d)
  const obj = {
    setZone: () => obj, setLocale: () => obj,
    get weekday() { return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts({ weekday: 'short' })] },
    toFormat: (f) => (f === 'HH:mm' ? parts({ hour: '2-digit', minute: '2-digit' }) : parts({ weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })),
  }
  return obj
}

function run(name, { input, nodes = {}, now = '2026-11-02T14:00:00Z' }) {
  const wrap = (arr) => ({ first: () => arr[0], last: () => arr[arr.length - 1], all: () => arr, item: arr[0] })
  const $ = (n) => { if (!nodes[n]) throw new Error('nodo sin datos en la prueba: ' + n); return wrap(nodes[n]) }
  const $input = wrap(input)
  const fn = new Function('$input', '$json', '$', '$now', `${codeOf(name)}`)
  return fn($input, input[0]?.json, $, stubNow(now))
}
const item = (json) => [{ json }]
const CFG = { wppiaUrl: 'x', webhookSecret: 'sec123', botActivo: true, soloPrueba: '', excluir: '', notificarA: '595981000000', pausaHoras: 8, esperaSegundos: 6, maxAudioSegundos: 150, atencionDesde: '08:00', atencionHasta: '18:00', atencionDias: '1,2,3,4,5', seguimientoActivo: true, seguimientoHoras: 22, seguimientoDesde: '08:30', seguimientoHasta: '18:00', crmActivo: false }
const hook = (body, secret = 'sec123') => item({ headers: { 'x-webhook-secret': secret }, body })
const norm = (body, cfg = CFG, secret) => run('Normalizar mensaje', { input: hook(body, secret), nodes: { Config: item(cfg) } })[0].json

const tx = norm(fx('text.json'))
t('texto: inbound con teléfono real (no LID)', () => { assert.strictEqual(tx.route, 'inbound'); assert.strictEqual(tx.kind, 'text'); assert.match(tx.phone, /^\d{8,15}$/); assert.ok(tx.text.length > 0) })
const au = norm(fx('audio-ptt.json'))
t('nota de voz: kind=audio con duración y datos para descifrar', () => { assert.strictEqual(au.kind, 'audio'); assert.ok(au.seconds > 0); assert.ok(au.rawForMedia.key.id); assert.ok(au.rawForMedia.message.audioMessage) })
t('imagen: kind=image', () => assert.strictEqual(norm(fx('image.json')).kind, 'image'))
t('documento: kind=document', () => assert.strictEqual(norm(fx('document.json')).kind, 'document'))
t('sin secreto en el header → descarta', () => assert.strictEqual(norm(fx('text.json'), CFG, 'otro').reason, 'secreto_invalido'))
t('secreto sin configurar (CAMBIAR) → descarta todo', () => assert.strictEqual(norm(fx('text.json'), { ...CFG, webhookSecret: 'CAMBIAR' }, 'CAMBIAR').reason, 'configurar_webhookSecret'))
t('modo prueba: número fuera de la lista se ignora', () => assert.strictEqual(norm(fx('text.json'), { ...CFG, soloPrueba: '595991111111' }).reason, 'fuera_de_la_lista_de_prueba'))
t('modo prueba: número de la lista pasa', () => assert.strictEqual(norm(fx('text.json'), { ...CFG, soloPrueba: tx.phone }).route, 'inbound'))
t('número interno (notificarA) nunca se atiende', () => assert.strictEqual(norm(fx('text.json'), { ...CFG, notificarA: tx.phone }).reason, 'numero_interno'))
t('grupo se descarta', () => { const b = fx('text.json'); b.data.messages.key.remoteJid = '123-456@g.us'; assert.strictEqual(norm(b).reason, 'grupo_o_difusion') })
t('reacción se descarta', () => { const b = fx('text.json'); b.data.messages.message = { reactionMessage: { text: '👍' } }; delete b.data.messages.messageBody; assert.strictEqual(norm(b).reason, 'mensaje_de_sistema') })
t('fromMe se enruta como toma humana', () => { const b = fx('text.json'); b.data.messages.key.fromMe = true; b.data.messages.key.remoteJid = tx.phone + '@s.whatsapp.net'; const r = norm(b); assert.strictEqual(r.route, 'fromMe'); assert.strictEqual(r.phone, tx.phone) })
t('scan (sin body) → ruta scan', () => assert.strictEqual(run('Normalizar mensaje', { input: item({}), nodes: { Config: item(CFG) } })[0].json.route, 'scan'))

// -- recorrido completo: primer mensaje de un lead de anuncio --
const wfNodes = (o) => ({ Config: item(CFG), ...o })
const lead = { ...tx, text: '¡Hola! Quisiera más información sobre la creación de EAS', name: 'Prueba' }
const est = run('Estado del chat', { input: item({}), nodes: wfNodes({ 'Normalizar mensaje': item(lead) }) })[0].json
t('estado: primer mensaje → responde', () => { assert.strictEqual(est.responder, true); assert.strictEqual(est.e.stage, 'NUEVO') })
t('estado: mismo messageId dos veces → duplicado', () => {
  const r = run('Estado del chat', { input: item({ estado: est.estado }), nodes: wfNodes({ 'Normalizar mensaje': item(lead) }) })[0].json
  assert.strictEqual(r.motivo, 'duplicado')
})
t('estado: bot apagado → no responde', () => assert.strictEqual(run('Estado del chat', { input: item({}), nodes: { Config: item({ ...CFG, botActivo: false }), 'Normalizar mensaje': item(lead) } })[0].json.motivo, 'bot_apagado'))
t('estado: pausado por persona → no responde', () => {
  const e2 = { pausedUntil: Date.now() + 1e6 }
  assert.strictEqual(run('Estado del chat', { input: item({ estado: JSON.stringify(e2) }), nodes: wfNodes({ 'Normalizar mensaje': item({ ...lead, messageId: 'Z1' }) }) })[0].json.motivo, 'pausado_por_persona')
})
t('estado: 10 respuestas en 1 h → corta y pausa', () => {
  const e2 = { hist: Array(10).fill(Date.now() - 1000) }
  const r = run('Estado del chat', { input: item({ estado: JSON.stringify(e2) }), nodes: wfNodes({ 'Normalizar mensaje': item({ ...lead, messageId: 'Z2' }) }) })[0].json
  assert.strictEqual(r.motivo, 'limite_por_hora'); assert.ok(r.e.pausedUntil > Date.now())
})
t('estado: "gracias" después de una respuesta no dispara al bot', () => {
  const e2 = { botReplies: 1 }
  assert.strictEqual(run('Estado del chat', { input: item({ estado: JSON.stringify(e2) }), nodes: wfNodes({ 'Normalizar mensaje': item({ ...lead, messageId: 'Z3', text: 'Gracias!' }) }) })[0].json.motivo, 'mensaje_de_cortesia')
})

const tf = run('Texto final', { input: item(est), nodes: wfNodes({ 'Estado del chat': item(est), 'Leer estado (entrante)': item({}) }) })[0].json
t('texto final: arma buffer y lastMsgId', () => { assert.strictEqual(tf.buffer, lead.text); assert.strictEqual(tf.lastMsgId, lead.messageId) })
t('texto final: audio transcripto', () => {
  const e2 = run('Estado del chat', { input: item({}), nodes: wfNodes({ 'Normalizar mensaje': item(au) }) })[0].json
  const r = run('Texto final', { input: item({ text: 'quiero abrir una EAS' }), nodes: wfNodes({ 'Estado del chat': item(e2), 'Leer estado (entrante)': item({}) }) })[0].json
  assert.strictEqual(r.text, '[Audio transcripto] quiero abrir una EAS')
  const r2 = run('Texto final', { input: item({ error: 'x' }), nodes: wfNodes({ 'Estado del chat': item(e2), 'Leer estado (entrante)': item({}) }) })[0].json
  assert.match(r2.text, /AUDIO NO COMPRENDIDO/)
})
t('texto final: manda solo el texto NUEVO (la base lo agrega al buffer)', () => {
  const r = run('Texto final', { input: item(est), nodes: wfNodes({ 'Estado del chat': item(est) }) })[0].json
  assert.strictEqual(r.buffer, lead.text)
})

const rowSaved = { estado: tf.estado, lastMsgId: tf.lastMsgId, buffer: tf.buffer }
t('último mensaje: el más reciente sigue, con todo el texto', () => {
  const r = run('¿Último mensaje?', { input: item(rowSaved), nodes: wfNodes({ 'Texto final': item(tf) }) })[0].json
  assert.strictEqual(r.continuar, true); assert.strictEqual(r.text, tf.buffer)
})
t('último mensaje: buffer ya consumido por otra ejecución → no responde dos veces', () => {
  const r = run('¿Último mensaje?', { input: item({ ...rowSaved, buffer: '' }), nodes: wfNodes({ 'Texto final': item(tf) }) })[0].json
  assert.strictEqual(r.continuar, false); assert.strictEqual(r.motivo, 'ya_consumido')
})
t('último mensaje: sin fila (otro mensaje lo reemplazó) → termina', () => {
  assert.strictEqual(run('¿Último mensaje?', { input: item({}), nodes: wfNodes({ 'Texto final': item(tf) }) })[0].json.continuar, false)
})
t('último mensaje: si llegó otro, esta ejecución termina', () => {
  assert.strictEqual(run('¿Último mensaje?', { input: item({ ...rowSaved, lastMsgId: 'OTRO' }), nodes: wfNodes({ 'Texto final': item(tf) }) })[0].json.continuar, false)
})
t('último mensaje: si una persona tomó el chat durante la espera, no responde', () => {
  const e2 = { ...tf.e, pausedUntil: Date.now() + 1e6 }
  assert.strictEqual(run('¿Último mensaje?', { input: item({ ...rowSaved, estado: JSON.stringify(e2) }), nodes: wfNodes({ 'Texto final': item(tf) }) })[0].json.continuar, false)
})

const ult = run('¿Último mensaje?', { input: item(rowSaved), nodes: wfNodes({ 'Texto final': item(tf) }) })[0].json
const fichaOut = run('Ficha de servicios', { input: item(ult), nodes: wfNodes({}) })[0].json
const ctxOut = run('Armar contexto IA', { input: item(fichaOut), nodes: wfNodes({ '¿Último mensaje?': item(ult), 'Ficha de servicios': item(fichaOut) }), now: '2026-11-02T14:00:00Z' })[0].json
t('contexto: incluye mensaje, catálogo de bloques y horario', () => {
  assert.match(ctxOut.aiInput, /creación de EAS/); assert.match(ctxOut.aiInput, /EAS_COSTO:/); assert.match(ctxOut.aiInput, /DENTRO del horario/)
})
t('contexto: sábado → fuera de horario', () => {
  const c = run('Armar contexto IA', { input: item(fichaOut), nodes: wfNodes({ '¿Último mensaje?': item(ult), 'Ficha de servicios': item(fichaOut) }), now: '2026-11-07T14:00:00Z' })[0].json
  assert.match(c.aiInput, /FUERA del horario/)
})

const parse = (output, lastE = ult, extra = {}) => run('Parsear respuesta IA', {
  input: item(output === null ? { error: 'boom' } : { output }),
  nodes: wfNodes({ 'Ficha de servicios': item(fichaOut), 'Armar contexto IA': item(ctxOut), '¿Último mensaje?': item({ ...lastE, ...extra }) }),
})[0].json

const good = JSON.stringify({ intent: 'EAS_COSTOS', stage: 'COSTOS_ENVIADOS', needs_human: false, lead: { nombre: 'Marcelo', rubro: 'consultora de marketing', tipo: 'EAS' }, reply_parts: ['Buenas, soy el asistente virtual de ROMEZ.'], blocks: ['EAS_COSTO', 'EAS_REQUISITOS', 'INVENTADO'], closing: '¿Le interesa avanzar?', confidence: 0.9 })
const p1 = parse('```json\n' + good + '\n```')
t('parseo: tolera ``` y descarta bloques inventados', () => {
  assert.deepStrictEqual(p1.meta.bloques, ['EAS_COSTO', 'EAS_REQUISITOS'])
  assert.strictEqual(p1.mensajes.length, 4)
  assert.ok(p1.mensajes[1].text.includes('Gs. 880.000'))
  assert.ok(p1.mensajes.every((m) => m.to === '+' + lead.phone))
})
t('parseo: la ficha del chat se actualiza (etapa, lead, bloques)', () => {
  const e = JSON.parse(p1.estado)
  assert.strictEqual(e.stage, 'COSTOS_ENVIADOS'); assert.strictEqual(e.lead.nombre, 'Marcelo'); assert.ok(e.bloques.EAS_COSTO); assert.strictEqual(e.priced, true); assert.strictEqual(p1.handoff, false)
})
t('parseo: NO repite un bloque ya enviado en 6 h', () => {
  const e = JSON.parse(p1.estado)
  const p = parse(good, { ...ult, e })
  assert.deepStrictEqual(p.meta.bloques, [])
})
t('parseo: un precio escrito por el modelo se descarta', () => {
  const bad = JSON.stringify({ stage: 'CALIFICANDO', needs_human: false, reply_parts: ['La EAS sale Gs. 500.000 nomás.', 'Cuénteme su rubro'], blocks: [], closing: '' })
  const p = parse(bad)
  assert.strictEqual(p.mensajes.length, 1); assert.ok(!/500\.000/.test(JSON.stringify(p.mensajes))); assert.strictEqual(p.meta.descartados.length, 1)
})
t('parseo: si solo había un precio inventado, deriva a una persona', () => {
  const p = parse(JSON.stringify({ needs_human: false, reply_parts: ['Son 1.500.000 mensuales'], blocks: [] }))
  assert.strictEqual(p.handoff, true); assert.strictEqual(p.mensajes.length, 1)
})
t('parseo: derivación pausa el chat, avisa al equipo y la etapa pasa a DERIVADO', () => {
  const p = parse(JSON.stringify({ intent: 'SRL_SA', needs_human: true, human_reason: 'Pide cotización de SA', reply_parts: ['El Lic. Rojas le escribe a la brevedad.'], blocks: [] }))
  const e = JSON.parse(p.estado)
  assert.strictEqual(p.handoff, true); assert.strictEqual(e.stage, 'DERIVADO'); assert.ok(e.pausedUntil > Date.now()); assert.match(p.aviso, /Pide cotización de SA/); assert.strictEqual(p.avisoTo, '+595981000000')
})
t('parseo: salida inválida o error del modelo → mensaje seguro y derivación', () => {
  for (const out of ['esto no es json', null, '']) { const p = parse(out); assert.strictEqual(p.handoff, true); assert.strictEqual(p.meta.fallback, true); assert.ok(p.mensajes.length >= 1) }
})
t('parseo: CRM solo se arma con crmActivo y nombre conocido', () => {
  assert.strictEqual(p1.crmSync, false)
  const p = run('Parsear respuesta IA', {
    input: item({ output: good }),
    nodes: { Config: item({ ...CFG, crmActivo: true }), 'Ficha de servicios': item(fichaOut), 'Armar contexto IA': item(ctxOut), '¿Último mensaje?': item(ult) },
  })[0].json
  assert.strictEqual(p.crmSync, true); assert.strictEqual(p.crm.phone, '+' + lead.phone); assert.strictEqual(p.crm.source, 'WHATSAPP_COMERCIAL')
})

// -- toma humana --
const meMsg = { ...lead, route: 'fromMe' }
t('toma humana: eco del propio bot (≤90 s) se ignora', () => {
  const e = { lastBotAt: Date.now() - 20000 }
  assert.strictEqual(run('Toma humana', { input: item({ estado: JSON.stringify(e) }), nodes: wfNodes({ 'Normalizar mensaje': item(meMsg) }) })[0].json.guardar, false)
})
t('toma humana: persona que escribe pausa el bot', () => {
  const e = { lastBotAt: Date.now() - 600000 }
  const r = run('Toma humana', { input: item({ estado: JSON.stringify(e) }), nodes: wfNodes({ 'Normalizar mensaje': item(meMsg) }) })[0].json
  assert.strictEqual(r.guardar, true); assert.ok(JSON.parse(r.estado).pausedUntil > Date.now() + 7 * 3600e3)
})

// -- seguimientos --
const H = 3600e3
const rowFor = (e) => ({ json: { estado: JSON.stringify({ phone: '595991222333', ...e }) } })
const seg = (rows, over = {}, now) => run('Seguimientos pendientes', { input: rows, nodes: { Config: item({ ...CFG, ...over }) }, now })
t('seguimiento: ofrece UN recordatorio a quien recibió costos y no contestó', () => {
  const r = seg([rowFor({ stage: 'COSTOS_ENVIADOS', lastInAt: Date.now() - 30 * H, lastOutAt: Date.now() - 26 * H, lead: { nombre: 'Alba Gómez' } })], {}, '2026-11-02T14:00:00Z')
  assert.strictEqual(r.length, 1); assert.match(r[0].json.text, /Buenas Alba,/); assert.strictEqual(JSON.parse(r[0].json.estado).followUpSent, true)
})
t('seguimiento: no repite, ni molesta si el cliente habló último, ni si hay pausa', () => {
  const base = { stage: 'COSTOS_ENVIADOS', lastInAt: Date.now() - 30 * H, lastOutAt: Date.now() - 26 * H }
  for (const e of [{ ...base, followUpSent: true }, { ...base, lastInAt: Date.now() - 1 * H }, { ...base, pausedUntil: Date.now() + H }, { ...base, stage: 'DERIVADO' }, { ...base, lastOutAt: Date.now() - 2 * H }, { ...base, lastOutAt: Date.now() - 80 * H }])
    assert.strictEqual(seg([rowFor(e)], {}, '2026-11-02T14:00:00Z').length, 0)
})
t('seguimiento: apagado por defecto, de noche o en fin de semana no envía', () => {
  const e = { stage: 'COSTOS_ENVIADOS', lastInAt: Date.now() - 30 * H, lastOutAt: Date.now() - 26 * H }
  assert.strictEqual(seg([rowFor(e)], { seguimientoActivo: false }, '2026-11-02T14:00:00Z').length, 0)
  assert.strictEqual(seg([rowFor(e)], {}, '2026-11-03T02:00:00Z').length, 0)
  assert.strictEqual(seg([rowFor(e)], {}, '2026-11-07T14:00:00Z').length, 0)
})


// ---------- configuración leída del CRM (panel /asistente) ----------
console.log('Configuración del CRM')
const CRM_RESP = {
  version: 1,
  config: { botActivo: false, soloPrueba: '595981123456', excluir: '', notificarA: '595991000111', pausaHoras: 4, esperaSegundos: 10, maxAudioSegundos: 90, maxRespuestasPorHora: 3, atencionDesde: '09:00', atencionHasta: '17:00', atencionDias: '1,2,3', seguimientoActivo: true, crmActivo: false },
  bloques: { EAS_COSTO: 'Creación de EAS – Gs. 900.000' },
  catalogo: { EAS_COSTO: 'Costo de la EAS' },
  sinTarifa: ['SRL o SA'],
  instruccionesExtra: 'No ofrezcas reuniones los viernes.',
  mensajeFallback: 'Ahora no puedo, le escribe una persona.',
  mensajeSeguimiento: 'Hola {{nombre}}, ¿pudo revisar todo?',
}
const BASE = { ...CFG, crmConfigActivo: true, crmUrl: 'https://crm/api/v1', headers: { h: 1 }, body: { b: 1 } }
const merge = (remote, base = BASE) => run('Config', { input: item(remote), nodes: { 'Config base': item(base) } })[0].json

t('el flujo lee primero Config base, decide si consultar al CRM y recién ahí Config', () => {
  const c = wf.connections
  const to = (from, out = 0) => (c[from]?.main?.[out] ?? []).map((x) => x.node)
  assert.deepStrictEqual(to('Webhook wppia'), ['Config base'])
  assert.deepStrictEqual(to('Cada hora (seguimientos)'), ['Config base'])
  assert.deepStrictEqual(to('Config base'), ['¿Leer config del CRM?'])
  assert.deepStrictEqual(to('¿Leer config del CRM?', 0), ['Config del CRM'])
  assert.deepStrictEqual(to('¿Leer config del CRM?', 1), ['Config'])
  assert.deepStrictEqual(to('Config del CRM'), ['Config'])
  assert.deepStrictEqual(to('Config'), ['Normalizar mensaje'])
})
t('si el CRM falla, la lectura no corta el flujo (onError continúa)', () => {
  assert.strictEqual(wf.nodes.find((n) => n.name === 'Config del CRM').onError, 'continueRegularOutput')
})
t('la lectura del CRM viene apagada por defecto', () => {
  const base = wf.nodes.find((n) => n.name === 'Config base').parameters.assignments.assignments.find((a) => a.name === 'crmConfigActivo')
  assert.strictEqual(base.value, false)
})
t('con la respuesta del CRM mandan sus valores y se conservan los del nodo (secreto, URL, webhook)', () => {
  const out = merge(CRM_RESP)
  assert.strictEqual(out.configOrigen, 'crm')
  assert.strictEqual(out.botActivo, false)
  assert.strictEqual(out.pausaHoras, 4)
  assert.strictEqual(out.soloPrueba, '595981123456')
  assert.strictEqual(out.webhookSecret, CFG.webhookSecret)
  assert.strictEqual(out.crmUrl, 'https://crm/api/v1')
  assert.deepStrictEqual(out.headers, { h: 1 })
  assert.deepStrictEqual(out.bloques, CRM_RESP.bloques)
  assert.strictEqual(out.instruccionesExtra, CRM_RESP.instruccionesExtra)
})
t('si el CRM no responde, se usa Config base y se deja marcado', () => {
  const out = merge({ error: { status: 502 } })
  assert.strictEqual(out.configOrigen, 'base (el CRM no respondió)')
  assert.strictEqual(out.botActivo, CFG.botActivo)
  assert.strictEqual(out.bloques, undefined)
})
t('con la lectura apagada, Config pasa igual con los valores base', () => {
  const out = merge({ ...BASE }, { ...BASE, crmConfigActivo: false })
  assert.strictEqual(out.configOrigen, 'base')
})
t('un CRM que apaga el asistente lo apaga también en el flujo', () => {
  const cfgCrm = merge(CRM_RESP)
  const msg = { ...lead, messageId: 'Q1' }
  const r = run('Estado del chat', { input: item({}), nodes: { Config: item(cfgCrm), 'Normalizar mensaje': item(msg) } })[0].json
  assert.strictEqual(r.responder, false)
  assert.strictEqual(r.motivo, 'bot_apagado')
})
t('el tope de respuestas por hora sale del CRM', () => {
  const cfgCrm = merge({ ...CRM_RESP, config: { ...CRM_RESP.config, botActivo: true } })
  const e2 = { hist: [Date.now() - 1000, Date.now() - 2000, Date.now() - 3000] }
  const r = run('Estado del chat', { input: item({ estado: JSON.stringify(e2) }), nodes: { Config: item(cfgCrm), 'Normalizar mensaje': item({ ...lead, messageId: 'Q2' }) } })[0].json
  assert.strictEqual(r.motivo, 'limite_por_hora')
})
t('Ficha de servicios: con el CRM usa SUS bloques (incluso vacíos), sin el CRM usa los del nodo', () => {
  const conCrm = run('Ficha de servicios', { input: item({}), nodes: { Config: item(merge(CRM_RESP)) } })[0].json
  assert.deepStrictEqual(conCrm.bloques, CRM_RESP.bloques)
  assert.strictEqual(conCrm.origen, 'crm')
  const vacio = run('Ficha de servicios', { input: item({}), nodes: { Config: item(merge({ ...CRM_RESP, bloques: {}, catalogo: {} })) } })[0].json
  assert.deepStrictEqual(vacio.bloques, {})
  const sinCrm = run('Ficha de servicios', { input: item({}), nodes: wfNodes({}) })[0].json
  assert.strictEqual(sinCrm.origen, 'nodo')
  assert.ok(sinCrm.bloques.EAS_COSTO.includes('880.000'))
})
t('el precio del CRM llega exacto al cliente y el modelo no ve montos', () => {
  const nodes = { Config: item(merge(CRM_RESP)) }
  const f = run('Ficha de servicios', { input: item({}), nodes })[0].json
  const ctx = run('Armar contexto IA', { input: item(f), nodes: { ...nodes, '¿Último mensaje?': item(ult), 'Ficha de servicios': item(f) } })[0].json
  assert.ok(!ctx.aiInput.includes('900.000'), 'el modelo no debe ver el monto')
  const salida = JSON.stringify({ stage: 'COSTOS_ENVIADOS', needs_human: false, reply_parts: ['Le paso los costos'], blocks: ['EAS_COSTO'] })
  const limpio = { ...ult, e: {} } // Parsear modifica el estado que recibe: usamos una copia sin bloques ya enviados
  const p = run('Parsear respuesta IA', { input: item({ output: salida }), nodes: { ...nodes, 'Ficha de servicios': item(f), 'Armar contexto IA': item(ctx), '¿Último mensaje?': item(limpio) } })[0].json
  assert.ok(p.mensajes.some((m) => m.text === 'Creación de EAS – Gs. 900.000'))
})
t('las instrucciones extra del estudio llegan al contexto (y sólo si existen)', () => {
  const nodes = { Config: item(merge(CRM_RESP)) }
  const f = run('Ficha de servicios', { input: item({}), nodes })[0].json
  const con = run('Armar contexto IA', { input: item(f), nodes: { ...nodes, '¿Último mensaje?': item(ult), 'Ficha de servicios': item(f) } })[0].json
  assert.ok(con.aiInput.includes('INSTRUCCIONES ADICIONALES DEL ESTUDIO'))
  assert.ok(con.aiInput.includes('reuniones los viernes'))
  assert.ok(!ctxOut.aiInput.includes('INSTRUCCIONES ADICIONALES'))
})
t('el mensaje de falla de la IA sale del CRM', () => {
  const nodes = { Config: item(merge(CRM_RESP)) }
  const f = run('Ficha de servicios', { input: item({}), nodes })[0].json
  const p = run('Parsear respuesta IA', { input: item({ output: 'no es json' }), nodes: { ...nodes, 'Ficha de servicios': item(f), 'Armar contexto IA': item(ctxOut), '¿Último mensaje?': item(ult) } })[0].json
  assert.strictEqual(p.mensajes[0].text, CRM_RESP.mensajeFallback)
})
t('el seguimiento usa la plantilla del CRM, con y sin nombre', () => {
  const abierto = { ...CRM_RESP.config, botActivo: true, soloPrueba: '', atencionDesde: '08:00', atencionHasta: '18:00', atencionDias: '1,2,3,4,5', seguimientoDesde: '08:30', seguimientoHasta: '18:00', seguimientoHoras: 22 }
  const cfgCrm = merge({ ...CRM_RESP, config: abierto })
  const fila = (extra) => [rowFor({ stage: 'COSTOS_ENVIADOS', lastInAt: Date.now() - 30 * H, lastOutAt: Date.now() - 26 * H, ...extra })]
  const con = run('Seguimientos pendientes', { input: fila({ lead: { nombre: 'Alba Gómez' } }), nodes: { Config: item(cfgCrm) }, now: '2026-11-02T14:00:00Z' })
  assert.strictEqual(con[0].json.text, 'Hola Alba, ¿pudo revisar todo?')
  const sin = run('Seguimientos pendientes', { input: fila({}), nodes: { Config: item({ ...cfgCrm, mensajeSeguimiento: 'Buenas {{nombre}}, ¿pudo revisar?' }) }, now: '2026-11-02T14:00:00Z' })
  assert.strictEqual(sin[0].json.text, 'Buenas, ¿pudo revisar?')
})

console.log(`\n${ok} pruebas OK`)
