// Procesos de Wolves en el VPS compartido. Escuchan en 172.18.0.1 (gateway de n8n_default) para
// que Traefik llegue directo; no quedan expuestos a Internet. Corre bajo el usuario `wolves`.
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..', '..', '..', '..')

module.exports = {
  apps: [
    {
      name: 'wolves-backend',
      cwd: path.join(root, 'backend'),
      script: 'dist/src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1200M',
      kill_timeout: 15_000,
      listen_timeout: 15_000,
      env: {
        NODE_ENV: 'production',
        PORT: '3820',
        HOST: '172.18.0.1',
      },
    },
    {
      name: 'wolves-frontend',
      cwd: path.join(root, 'frontend'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3821 -H 172.18.0.1',
      interpreter: '/usr/bin/node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '800M',
      kill_timeout: 10_000,
      listen_timeout: 15_000,
      env: {
        NODE_ENV: 'production',
        PORT: '3821',
      },
    },
  ],
}
