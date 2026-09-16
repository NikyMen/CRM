#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const sshAlias = (process.env.CRM_VPS_ALIAS || '').trim()
const remoteDir = (process.env.CRM_VPS_DIR || '/var/www/crm').trim()
const command = process.argv[2] || 'help'

if (sshAlias && !/^[a-zA-Z0-9_.-]+$/.test(sshAlias)) {
  console.error('CRM_VPS_ALIAS contiene caracteres no permitidos.')
  process.exit(2)
}

if (!/^\/[a-zA-Z0-9_./-]+$/.test(remoteDir)) {
  console.error('CRM_VPS_DIR debe ser una ruta Linux absoluta y simple.')
  process.exit(2)
}

const quotedRemoteDir = `'${remoteDir}'`
const baseSshArgs = [
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=10',
  sshAlias,
]

function runRemote(remoteCommand) {
  if (!sshAlias) {
    console.error('Configurá CRM_VPS_ALIAS con el alias del servidor actual. No hay servidor predeterminado.')
    process.exit(2)
  }
  const result = spawnSync('ssh', [...baseSshArgs, remoteCommand], {
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    console.error(`No se pudo ejecutar ssh: ${result.error.message}`)
    process.exit(1)
  }

  process.exit(result.status ?? 1)
}

function showHelp() {
  console.log(`Uso:
  pnpm vps check
  pnpm vps status
  pnpm vps logs [backend|frontend|postgres|redis] [lineas]

Configuracion:
  CRM_VPS_ALIAS  Alias del servidor actual en ~/.ssh/config (obligatorio)
  CRM_VPS_DIR    Carpeta remota del CRM (default: /var/www/crm)

Los comandos disponibles son de solo lectura. Deploy, restart, migraciones y
cambios remotos deben ejecutarse aparte con autorizacion explicita.`)
}

switch (command) {
  case 'check':
    runRemote([
      'set -eu',
      "printf 'ssh=ok\\n'",
      `test -d ${quotedRemoteDir}`,
      "printf 'crm_dir=ok\\n'",
      "command -v docker >/dev/null 2>&1",
      "printf 'docker=ok\\n'",
      "command -v pm2 >/dev/null 2>&1",
      "printf 'pm2=ok\\n'",
      "command -v nginx >/dev/null 2>&1",
      "printf 'nginx=ok\\n'",
      `test -f ${quotedRemoteDir}/docker-compose.yml`,
      "printf 'compose=ok\\n'",
    ].join('; '))
    break

  case 'status':
    runRemote([
      'set -eu',
      `cd ${quotedRemoteDir}`,
      "printf '%s\\n' '=== Git ==='",
      "git status --short --branch",
      "git log -1 --date=iso --pretty=format:'%h|%ad|%an|%s'",
      "printf '\\n%s\\n' '=== Docker Compose ==='",
      'docker compose ps --all',
      "printf '\\n%s\\n' '=== PM2 ==='",
      "if id romez >/dev/null 2>&1; then sudo -u romez -H env PM2_HOME=/home/romez/.pm2 pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s).filter(x=>[\"crm-backend\",\"crm-frontend\"].includes(x.name))) console.log([\"romez\",p.name,p.pm2_env.status,p.pm2_env.pm_cwd,p.pm2_env.pm_exec_path].join(\"|\"))})'; fi",
      "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s).filter(x=>[\"crm-backend\",\"crm-frontend\"].includes(x.name))) console.log([\"root\",p.name,p.pm2_env.status,p.pm2_env.pm_cwd,p.pm2_env.pm_exec_path].join(\"|\"))})'",
      "printf '\\n%s\\n' '=== Health ==='",
      "curl -fsS --max-time 5 http://127.0.0.1:3000/health",
    ].join('; '))
    break

  case 'logs': {
    const service = process.argv[3] || 'backend'
    const allowedServices = new Set(['backend', 'frontend', 'postgres', 'redis'])
    const lines = Number.parseInt(process.argv[4] || '100', 10)

    if (!allowedServices.has(service)) {
      console.error(`Servicio no permitido: ${service}`)
      process.exit(2)
    }

    if (!Number.isInteger(lines) || lines < 1 || lines > 1000) {
      console.error('La cantidad de lineas debe estar entre 1 y 1000.')
      process.exit(2)
    }

    if (service === 'backend' || service === 'frontend') {
      const processName = service === 'backend' ? 'crm-backend' : 'crm-frontend'
      runRemote(`set -eu; if id romez >/dev/null 2>&1 && sudo -u romez -H env PM2_HOME=/home/romez/.pm2 pm2 describe ${processName} >/dev/null 2>&1; then sudo -u romez -H env PM2_HOME=/home/romez/.pm2 pm2 logs ${processName} --nostream --lines ${lines}; else pm2 logs ${processName} --nostream --lines ${lines}; fi`)
    }

    runRemote(`set -eu; cd ${quotedRemoteDir}; docker compose logs --no-color --tail ${lines} ${service}`)
    break
  }

  case 'help':
  case '--help':
  case '-h':
    showHelp()
    break

  default:
    console.error(`Comando desconocido: ${command}`)
    showHelp()
    process.exit(2)
}
