// Ajustes post-bootstrap de Wolves por la API autenticada (sin SQL, sin tocar código):
// embudo "Pedidos Wolves" con sus etapas, checklists contables archivados y módulos.
// Idempotente: se puede volver a correr. No imprime credenciales ni el token.
// Lee email= y password= de un archivo local fuera de git (backend/.data/owner-wolves.txt).
//   node deploy/clients/wolves/post-bootstrap.cjs backend/.data/owner-wolves.txt [http://127.0.0.1:3010/api/v1]
const fs = require('node:fs')

const [ownerFile, apiArg] = process.argv.slice(2)
const API = apiArg || 'http://127.0.0.1:3010/api/v1'
const owner = Object.fromEntries(fs.readFileSync(ownerFile, 'utf8').split(/\r?\n/)
  .filter((line) => /^\w+=/.test(line))
  .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))

let token = null
async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`)
  return data
}
const list = (data) => Array.isArray(data) ? data : data?.items ?? data?.data ?? []

const PIPELINE_FROM = 'Gestión Comercial ROMEZ'
const PIPELINE_TO = 'Pedidos Wolves'
const RENAMES = {
  'Consulta recibida': 'Consulta',
  'Calificación': 'Diseño/presupuesto',
  'Propuesta enviada': 'Seña recibida',
  'Negociación': 'En producción',
  'Cliente activo': 'Entregado',
}
const NEW_STAGE = { name: 'Listo para entregar', color: '#0d9488' }
const ORDER = ['Consulta', 'Diseño/presupuesto', 'Seña recibida', 'En producción', 'Listo para entregar', 'Entregado', 'No concretado']
const ACCOUNTING_CHECKLISTS = ['Cierre tributario mensual', 'Liquidación mensual de salarios', 'Cierre contable anual', 'Alta de cliente']
const MODULES_ON = ['sales', 'stock', 'commercial', 'tickets', 'customer-service', 'internal-chat', 'team', 'clients', 'collections', 'daily-reports']

;(async () => {
  const login = await call('POST', '/auth/login', { email: owner.email, password: owner.password })
  token = login.accessToken
  console.log(`login ok: rol=${login.role} workspace="${login.workspace?.name}" slug=${login.workspace?.slug}`)

  // ─── Embudo ───────────────────────────────────────────────────
  let pipelines = await call('GET', '/pipelines')
  let pipeline = pipelines.find((p) => p.name === PIPELINE_TO) ?? pipelines.find((p) => p.name === PIPELINE_FROM)
  if (!pipeline) throw new Error(`No encontré "${PIPELINE_FROM}" ni "${PIPELINE_TO}"`)
  if (pipeline.name !== PIPELINE_TO) {
    pipeline = await call('PATCH', `/pipelines/${pipeline.id}`, { name: PIPELINE_TO })
    console.log(`embudo renombrado: "${PIPELINE_FROM}" -> "${PIPELINE_TO}"`)
  } else console.log(`embudo ya se llama "${PIPELINE_TO}"`)
  // Si se volvió a correr db:bootstrap, recreó "Gestión Comercial ROMEZ" como predeterminado.
  if (!pipeline.isDefault) {
    pipeline = await call('PATCH', `/pipelines/${pipeline.id}`, { isDefault: true })
    console.log(`"${PIPELINE_TO}" vuelve a ser el embudo predeterminado`)
  }
  const leftover = pipelines.find((p) => p.name === PIPELINE_FROM && p.id !== pipeline.id)
  if (leftover) console.log(`AVISO: quedó otro embudo "${PIPELINE_FROM}" (lo recreó el bootstrap); borralo desde Gestión comercial si está vacío.`)

  for (const stage of pipeline.stages) {
    const to = RENAMES[stage.name]
    if (to) {
      await call('PATCH', `/pipelines/${pipeline.id}/stages/${stage.id}`, { name: to })
      console.log(`etapa: "${stage.name}" -> "${to}"`)
    }
  }
  pipelines = await call('GET', '/pipelines')
  pipeline = pipelines.find((p) => p.id === pipeline.id)
  if (!pipeline.stages.some((s) => s.name === NEW_STAGE.name)) {
    await call('POST', `/pipelines/${pipeline.id}/stages`, NEW_STAGE)
    console.log(`etapa creada: "${NEW_STAGE.name}"`)
    pipeline = (await call('GET', '/pipelines')).find((p) => p.id === pipeline.id)
  }
  const byName = new Map(pipeline.stages.map((s) => [s.name, s]))
  const missing = ORDER.filter((name) => !byName.has(name))
  const extra = pipeline.stages.filter((s) => !ORDER.includes(s.name)).map((s) => s.name)
  if (missing.length || extra.length) throw new Error(`etapas inesperadas: faltan ${missing} / sobran ${extra}`)
  pipeline = await call('PATCH', `/pipelines/${pipeline.id}/stages/reorder`, { stageIds: ORDER.map((name) => byName.get(name).id) })
  console.log(`embudo "${pipeline.name}" (predeterminado=${pipeline.isDefault}):`)
  for (const s of pipeline.stages) console.log(`  ${s.position}. ${s.name}  color=${s.color} prob=${s.probability ?? '—'}${s.isWon ? ' [ganada]' : ''}${s.isLost ? ' [perdida]' : ''}`)

  // ─── Checklists contables: archivar (la app no los borra, los desactiva) ───
  const templates = list(await call('GET', '/checklist-templates?limit=100&includeInactive=true'))
  for (const t of templates) {
    if (ACCOUNTING_CHECKLISTS.includes(t.name) && t.isActive) {
      await call('DELETE', `/checklist-templates/${t.id}`)
      console.log(`checklist archivado: "${t.name}"`)
    }
  }
  const after = list(await call('GET', '/checklist-templates?limit=100&includeInactive=true'))
  console.log(`checklists: ${after.map((t) => `"${t.name}" activo=${t.isActive}`).join(' · ')}`)
  console.log(`checklists activos visibles: ${list(await call('GET', '/checklist-templates?limit=100')).length}`)

  // ─── Módulos ──────────────────────────────────────────────────
  const modules = Object.fromEntries(MODULES_ON.map((key) => [key, true]))
  const result = await call('PATCH', '/auth/workspace-settings', { modules })
  console.log('módulos:', Object.entries(result.modules).map(([k, v]) => `${k}=${v ? 'on' : 'off'}`).join(' '))
})().catch((error) => { console.error('ERROR', error.message); process.exit(1) })
