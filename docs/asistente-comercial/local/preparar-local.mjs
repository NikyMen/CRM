// Prepara el entorno LOCAL de pruebas del asistente comercial (nunca toca producción):
//  1) crea en wppia local una sesión "ROMEZ comercial (local)" con el webhook apuntando al n8n local;
//  2) guarda token y secreto FUERA del repo (<N8N_DIR>/wppia-sesion.json);
//  3) importa en el n8n local la credencial de wppia y el flujo ya configurado para local.
// Uso: node preparar-local.mjs [--force]
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const WPPIA = process.env.WPPIA_DIR ?? 'D:/dev/wppia'
const N8N = process.env.N8N_DIR ?? 'D:/dev/n8n-local'
const FORCE = process.argv.includes('--force')
const WEBHOOK_URL = 'http://127.0.0.1:5678/webhook/romez-comercial'
const FLOW = path.resolve(import.meta.dirname, '..', 'romez-asistente-comercial.n8n.json')
const SESION = path.join(N8N, 'wppia-sesion.json')
const MARCA = path.join(N8N, '.flujo-importado')
const CRED_ID = 'wppiaLocal0001'

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} falló:\n${(r.stderr || r.stdout || '').slice(0, 800)}`)
  return r.stdout
}

if (!fs.existsSync(path.join(WPPIA, 'dist/src/cli.js'))) throw new Error(`No encuentro wppia compilado en ${WPPIA} (npm run build)`)
if (!fs.existsSync(path.join(N8N, 'node_modules/n8n/bin/n8n'))) throw new Error(`n8n no está instalado en ${N8N} (npm install n8n)`)
fs.mkdirSync(path.join(N8N, 'data'), { recursive: true })

// 1) sesión de wppia (una sola vez; token y secreto solo se muestran al crearla)
if (!fs.existsSync(SESION)) {
  const out = run('node', ['dist/src/cli.js', 'create-session', 'ROMEZ comercial (local)', WEBHOOK_URL], { cwd: WPPIA })
  const s = JSON.parse(out.slice(out.indexOf('{')))
  fs.writeFileSync(SESION, JSON.stringify(s, null, 2), { mode: 0o600 })
  console.log(`✔ sesión de wppia creada (id ${s.id}); token y secreto guardados en ${SESION}`)
} else {
  console.log('• la sesión de wppia ya existía, no se vuelve a crear')
}
const ses = JSON.parse(fs.readFileSync(SESION, 'utf8'))

// 2) flujo adaptado a local (copia: el del repo no se toca)
const wf = JSON.parse(fs.readFileSync(FLOW, 'utf8'))
const set = (name, value) => {
  const cfg = wf.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments.find((a) => a.name === name)
  cfg.value = value
}
set('wppiaUrl', 'http://127.0.0.1:3720')
set('webhookSecret', ses.webhookSecret)
// Seguro por defecto: el bot NO contesta a nadie hasta que pongas acá tu teléfono de prueba.
set('soloPrueba', '000000000')
for (const n of wf.nodes) if (n.credentials?.httpBearerAuth) n.credentials.httpBearerAuth = { id: CRED_ID, name: 'wppia ROMEZ comercial' }
const patched = path.join(N8N, 'romez-comercial.local.n8n.json')
fs.writeFileSync(patched, JSON.stringify([wf]), { mode: 0o600 })

// 3) importar en n8n (credencial con el token + flujo)
if (!fs.existsSync(MARCA) || FORCE) {
  const env = { ...process.env, N8N_USER_FOLDER: path.join(N8N, 'data'), N8N_DIAGNOSTICS_ENABLED: 'false' }
  const credFile = path.join(N8N, 'cred.tmp.json')
  fs.writeFileSync(credFile, JSON.stringify([{ id: CRED_ID, name: 'wppia ROMEZ comercial', type: 'httpBearerAuth', data: { token: ses.token } }]), { mode: 0o600 })
  try {
    run('node', ['node_modules/n8n/bin/n8n', 'import:credentials', `--input=${credFile}`], { cwd: N8N, env })
    run('node', ['node_modules/n8n/bin/n8n', 'import:workflow', `--input=${patched}`], { cwd: N8N, env })
  } finally { fs.rmSync(credFile, { force: true }) }
  fs.writeFileSync(MARCA, new Date().toISOString())
  console.log('✔ credencial de wppia y flujo importados en el n8n local')
} else {
  console.log('• el flujo ya estaba importado (usá --force para importarlo de nuevo)')
}
console.log('\nListo. Falta: crear usuario en n8n, la credencial OpenAI, la Data Table y tu teléfono en soloPrueba (ver LOCAL.md).')
